from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import hashlib
import json
import logging
import threading
import time
import uuid
from .agent import DeterministicPolicy, HostedPolicy
from .robotics import RoboticsBackend
from .science import ScienceBackend
from .cloth import ClothBackend
from .storage import Store, encode

log = logging.getLogger(__name__)


def uid():
    return str(uuid.uuid4())


class Conflict(ValueError):
    pass


class Busy(ValueError):
    pass


class Unavailable(ValueError):
    pass


class Runtime:
    def __init__(self, database):
        self.store = Store(database)
        self.backends = {'mujoco': RoboticsBackend(), 'scipy': ScienceBackend(), 'cloth':ClothBackend()}
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='vivacity-simulation')
        self.capacity = threading.BoundedSemaphore(8)
        self.futures = {}
        # Single-process local deployment: persisted interrupted jobs cannot be resumed implicitly.
        with self.store.connect() as db:
            records = [json.loads(r[0]) for r in db.execute('SELECT payload FROM experiments')]
            for e in records:
                if e['status'] in ('queued', 'running'):
                    e.update(status='failed', error='worker_interrupted_by_restart')
                    self.store.put('experiments', e, db)
                    self.store.event(e['id'], 'failed', {'error': e['error']}, db)

    def close(self):
        self.executor.shutdown(wait=True)

    def create_world(self, request):
        tic = time.perf_counter()
        backend = self.backends[request.backend]
        instance = backend.create_world(request.config.model_dump(), request.seed)
        state = backend.snapshot(instance)
        world = {'schema_version': '1.0', 'id': uid(), 'backend': request.backend, 'config': deepcopy(state['config']), 'state': state, 'initial_state': deepcopy(state), 'action_schema': backend.action_schema, 'simulator_version': backend.version, 'seed': request.seed, 'revision': 0, 'history': [], 'branches': [], 'evaluations': [], 'performance': {'initialization_wall_seconds': time.perf_counter()-tic}}
        self.store.put('worlds', world)
        return world

    def get_world(self, identifier):
        return self.store.get('worlds', identifier)

    def observe(self, identifier):
        w = self.get_world(identifier)
        return {'schema_version': '1.0', 'world_id': identifier, 'revision': w['revision'], 'observation': self.backends[w['backend']].observe(self.backends[w['backend']].fork(w['state']))}

    def snapshot(self, identifier):
        return deepcopy(self.get_world(identifier)['state'])

    def fork(self, identifier):
        w = self.get_world(identifier)
        return self.backends[w['backend']].fork(w['state'])

    def apply_action(self, backend, instance, action):
        self.backends[backend].apply_action(instance, action)

    def simulate(self, backend, instance, limits):
        return self.backends[backend].simulate(instance, limits)

    def evaluate(self, backend, instance, result):
        return self.backends[backend].evaluate(instance, result)

    def submit(self, world_id, request, idempotency_key=None):
        if idempotency_key is not None:
            import re
            if not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}', idempotency_key):
                raise ValueError('invalid idempotency key')
        fingerprint = hashlib.sha256(encode(request.model_dump()).encode()).hexdigest()
        reserved = False
        try:
            with self.lock, self.store.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if idempotency_key is not None:
                    prior = db.execute('SELECT fingerprint,experiment_id FROM submissions WHERE world_id=? AND key=?', (world_id, idempotency_key)).fetchone()
                    if prior:
                        if prior[0] != fingerprint:
                            raise Conflict('idempotency key was already used with different experiment settings')
                        return self.get_experiment(prior[1])
                if not self.capacity.acquire(blocking=False):
                    raise Busy('experiment queue is full; retry after a job completes')
                reserved = True
                w = self.store.get('worlds', world_id, db)
                eid = uid()
                e = {'schema_version': '1.0', 'id': eid, 'world_id': world_id, 'revision': w['revision'], 'status': 'queued', 'request': request.model_dump(), 'selected_branch_id': None, 'result': {}, 'performance': {}, 'error': None, 'stale': False, 'snapshot': deepcopy(w['state']), 'config': w['config'], 'backend': w['backend'], 'submitted_at': time.time()}
                self.store.put('experiments', e, db)
                self.store.event(eid, 'queued', db=db)
                if idempotency_key is not None:
                    db.execute('INSERT INTO submissions(world_id,key,fingerprint,experiment_id) VALUES(?,?,?,?)', (world_id, idempotency_key, fingerprint, eid))
                w['history'].append(eid)
                self.store.put('worlds', w, db)
            try:
                future = self.executor.submit(self._run_reserved, eid)
            except RuntimeError:
                e.update(status='failed', error='worker_submission_failed')
                with self.store.connect() as db:
                    self.store.put('experiments', e, db)
                    self.store.event(eid, 'failed', {'error': e['error']}, db)
                raise Unavailable('simulation worker unavailable; experiment failure was persisted')
            with self.lock:
                self.futures[eid] = future
            def finished(_):
                with self.lock:
                    self.futures.pop(eid, None)
            future.add_done_callback(finished)
            reserved = False  # The worker wrapper now owns the reserved queue slot.
            return self.get_experiment(eid)
        except BaseException:
            if reserved:
                self.capacity.release()
            raise

    def wait(self, eid, timeout=120):
        with self.lock:
            future = self.futures.get(eid)
        if future:
            future.result(timeout=timeout)
        return self.get_experiment(eid)

    def get_experiment(self, eid):
        e = self.store.get('experiments', eid)
        e['stale'] = self.get_world(e['world_id'])['revision'] != e['revision']
        return {k: v for k, v in e.items() if k not in ('snapshot', 'config', 'backend', 'submitted_at')}

    def _execute(self, eid):
        wall, cpu = time.perf_counter(), time.process_time()
        e = self.store.get('experiments', eid)
        try:
            e['status'] = 'running'
            self.store.put('experiments', e); self.store.event(eid, 'running')
            backend = self.backends[e['backend']]
            instance = backend.fork(e['snapshot'])
            policy = HostedPolicy() if e['request']['policy'] == 'llm' else DeterministicPolicy()
            settings, reasoning = policy.propose(backend.observe(instance), backend.action_schema, e['request'])
            search = None
            if e['backend']=='mujoco' and settings.get('search_candidates',0):
                from .search import search_reaches
                actions, planning_time, search = search_reaches(backend,instance,settings,lambda detail:self.store.event(eid,'progress',detail))
            elif e['backend']=='cloth' and settings.get('search_candidates',0):
                actions, planning_time, search = backend.search(instance,settings,lambda detail:self.store.event(eid,'progress',detail))
            else:
                actions, planning_time = backend.candidates(instance, settings['candidates'], settings['planner_iterations'])
            self.store.event(eid, 'planned', {'candidate_count': len(actions), 'planning_wall_seconds': planning_time})
            branches = []
            reference = f"{e['world_id']}:{e['revision']}:{hashlib.sha256(encode(e['snapshot']).encode()).hexdigest()}"
            def execute_action(action, run_settings):
                branch_wall = time.perf_counter()
                branch_instance = None
                phase = 'fork'
                try:
                    branch_instance = backend.fork(e['snapshot'])
                    phase = 'apply_action'
                    self.apply_action(e['backend'], branch_instance, action)
                    phase = 'simulate'
                    result = self.simulate(e['backend'], branch_instance, run_settings)
                    phase = 'evaluate'
                    evaluation = self.evaluate(e['backend'], branch_instance, result)
                    phase = 'snapshot'
                    final_state = backend.snapshot(branch_instance)
                    trace = result['trace']
                    phase = 'serialize_result'
                    encode({'evaluation': evaluation, 'trace': trace, 'final_state': final_state})
                    performance = {'wall_seconds': time.perf_counter()-branch_wall, 'physics_wall_seconds': result['physics_wall_seconds'], 'simulation_steps': result.get('simulation_steps', 0), 'integration_calls': result.get('integration_calls', 0), 'measurement_complete': True}
                except Exception as exc:
                    # Do not invent frames or step counts when an adapter loses its trace.
                    log.error('branch adapter failed: experiment=%s phase=%s type=%s', eid, phase, type(exc).__name__)
                    final_state = None
                    if branch_instance is not None:
                        try:
                            final_state = backend.snapshot(branch_instance)
                            encode(final_state)
                        except Exception:
                            final_state = None
                    trace = []
                    evaluation = {'success': False, 'status': 'adapter_failure', 'phase': phase, 'error_type': type(exc).__name__, 'trace_available': False, 'final_state_available': final_state is not None}
                    performance = {'wall_seconds': time.perf_counter()-branch_wall, 'physics_wall_seconds': None, 'simulation_steps': None, 'integration_calls': None, 'measurement_complete': False}
                branch = {'schema_version': '1.0', 'id': uid(), 'experiment_id': eid, 'parent_state_reference': reference, 'initial_state': deepcopy(e['snapshot']), 'action': deepcopy(action), 'trace': trace, 'final_state': final_state, 'evaluation': evaluation, 'performance': performance}
                # Persist evidence and lineage together, even if a later branch/job fails.
                with self.lock, self.store.connect() as db:
                    db.execute('BEGIN IMMEDIATE')
                    current = self.store.get('worlds', e['world_id'], db)
                    current['branches'].append({'experiment_id': eid, 'branch_id': branch['id'], 'parent_state_reference': reference, 'revision': e['revision']})
                    current['evaluations'].append({'branch_id': branch['id'], 'evaluation': evaluation})
                    self.store.put('worlds', current, db)
                    self.store.put('branches', branch, db)
                    self.store.event(eid, 'branch_completed', {'branch_id': branch['id'], 'evaluation': evaluation}, db)
                branches.append(branch)
                if search is not None:
                    integrated=sum(bool((b['performance']['simulation_steps'] or 0)+(b['performance']['integration_calls'] or 0)) for b in branches)
                    self.store.event(eid,'progress',{'stage':'physics','fully_simulated':integrated,'physics_attempts':len(branches),'physics_target':len(actions),'verified_feasible':sum(b['evaluation']['success'] for b in branches),'elapsed_seconds':time.perf_counter()-wall,'message':f"Validation {len(branches)} / {len(actions)}; {integrated} integrated rollouts; {sum(b['evaluation']['success'] for b in branches)} verified feasible."})
            for action in actions:
                execute_action(action, settings)
            # Choose additional tool work from measured outcomes, with one bounded retry.
            followup = None if search is not None else DeterministicPolicy().next_experiment(e['backend'], backend.observe(instance), branches, settings)
            if followup:
                extra_actions, extra_planning = backend.candidates(instance, followup['candidates'], followup['planner_iterations'])
                planning_time += extra_planning
                self.store.event(eid, 'planned', {'candidate_count': len(extra_actions)-1, 'planning_wall_seconds': extra_planning, 'followup': True})
                for action in extra_actions[1:]:
                    action = action | {'followup': True, 'planning_iterations': followup['planner_iterations']}
                    execute_action(action, followup)
            if e['backend'] == 'mujoco':
                objective = lambda b:(not b['evaluation']['success'],b['evaluation'].get('execution_duration_s',float('inf')),b['evaluation'].get('joint_path_length_rad',float('inf')),b['evaluation'].get('goal_error_m',float('inf')),b['action'].get('candidate_index',-1))
                successful = sorted([b for b in branches if b['evaluation']['success']], key=objective)
                selected = successful[0]['id'] if successful else None
                # The reported ranking and selected winner use the same measured criterion.
                ranked = sorted(branches, key=objective)
                conclusion = {'conclusion': 'Measured collision-free reach found.' if selected else 'No candidate executed a collision-free reach.', 'milestone': 'reach_only', 'ranked_branch_ids': [b['id'] for b in ranked], 'top_feasible_branch_ids':[b['id'] for b in successful[:3]]}
            else:
                selected, conclusion = backend.choose(branches)
            e.update(status='completed', selected_branch_id=selected, result=conclusion | {'policy': reasoning, 'executed_settings': settings, 'followup_settings': followup})
            if search is not None:
                integrated=lambda b:bool((b['performance']['simulation_steps'] or 0)+(b['performance']['integration_calls'] or 0)) and b['performance']['measurement_complete']
                search.update(fully_simulated=sum(integrated(b) for b in branches),physics_attempts=len(branches),planning_failed=sum(b['evaluation']['status']=='planning_failure' for b in branches),verified_feasible=sum(b['evaluation']['success'] for b in branches),physics_rejected=sum(not b['evaluation']['success'] and integrated(b) for b in branches))
                e['result']['search']=search
            adapter_errors = sum(b['evaluation']['status'] == 'adapter_failure' for b in branches)
            if adapter_errors == len(branches):
                e.update(status='failed', error='all_branches_failed:adapter_failure')
            e['stale'] = self.get_world(e['world_id'])['revision'] != e['revision']
            replay = self._replay(e, branches)
            e['performance'] = {'job_wall_seconds': time.perf_counter()-wall, 'process_cpu_seconds': time.process_time()-cpu, 'queue_wait_seconds': max(0., time.time()-e['submitted_at']-(time.perf_counter()-wall)), 'planning_wall_seconds': planning_time, 'physics_wall_seconds': sum(b['performance']['physics_wall_seconds'] or 0 for b in branches), 'candidate_count': len(branches), 'simulation_steps': sum(b['performance']['simulation_steps'] or 0 for b in branches), 'integration_calls': sum(b['performance']['integration_calls'] or 0 for b in branches), 'replay_payload_bytes': len(encode(replay).encode()), 'branch_failure_rate': sum(not b['evaluation']['success'] for b in branches)/len(branches), 'adapter_error_count': adapter_errors, 'measurement_complete': adapter_errors == 0, 'job_error_rate': float(adapter_errors > 0), 'compute': 'local CPU; one worker; process CPU time includes concurrent API activity; no billed model calls under deterministic policy'}
            with self.lock, self.store.connect() as db:
                w = self.store.get('worlds', e['world_id'], db)
                e['stale'] = w['revision'] != e['revision']
                self.store.put('experiments', e, db)
                terminal = 'failed' if e['status'] == 'failed' else 'completed'
                self.store.event(eid, terminal, {'selected_branch_id': selected, 'stale': e['stale'], 'adapter_error_count': adapter_errors, 'error': e['error']}, db)
        except Exception as exc:
            log.exception('experiment %s failed', eid)
            # Provider responses and keys are never persisted or logged.
            e.update(status='failed', error=f'experiment_failed:{type(exc).__name__}')
            e['performance'] = {'job_wall_seconds': time.perf_counter()-wall, 'process_cpu_seconds': time.process_time()-cpu, 'job_error_rate': 1.0}
            with self.store.connect() as db:
                self.store.put('experiments', e, db)
                self.store.event(eid, 'failed', {'error': e['error']}, db)

    def _run_reserved(self, eid):
        # Release before the Future completes, so waiters can immediately reuse capacity.
        try:
            self._execute(eid)
        finally:
            self.capacity.release()

    def commit(self, world_id, experiment_id, branch_id):
        with self.lock, self.store.connect() as db:
            w = self.store.get('worlds', world_id, db)
            e = self.store.get('experiments', experiment_id, db)
            b = self.store.get('branches', branch_id, db)
            if e['world_id'] != world_id or b['experiment_id'] != experiment_id:
                raise Conflict('branch does not belong to this world/experiment')
            if e['revision'] != w['revision'] or e['status'] != 'completed':
                raise Conflict('branch is stale or experiment is incomplete')
            if not b['evaluation']['success']:
                raise Conflict('failed branch cannot be committed')
            w['state'] = self.backends[w['backend']].commit(b['final_state'])
            w['revision'] += 1
            self.store.put('worlds', w, db)
            return w

    def reset(self, world_id):
        with self.lock, self.store.connect() as db:
            w = self.store.get('worlds', world_id, db)
            w['state'] = deepcopy(w['initial_state']); w['revision'] += 1
            self.store.put('worlds', w, db)
            return w

    def environment(self, world_id, config):
        from .schemas import RoboticsConfig, ScienceConfig, ClothConfig
        with self.lock, self.store.connect() as db:
            w = self.store.get('worlds', world_id, db)
            expected = {'mujoco':RoboticsConfig,'scipy':ScienceConfig,'cloth':ClothConfig}[w['backend']]
            if not isinstance(config, expected):
                raise ValueError('config does not match world backend')
            instance = self.backends[w['backend']].create_world(config.model_dump(), w['seed'])
            state = self.backends[w['backend']].snapshot(instance)
            w.update(state=state, initial_state=deepcopy(state), config=state['config'], revision=w['revision']+1)
            self.store.put('worlds', w, db)
            return w

    def _replay(self, e, branches):
        return {'schema_version': '1.0', 'experiment_id': e['id'], 'backend': e['backend'], 'config': e['config'], 'stale': e['stale'], 'branches': [self.backends[e['backend']].replay(b) for b in branches]}

    def replay(self, eid):
        e = self.store.get('experiments', eid)
        e['stale'] = self.get_world(e['world_id'])['revision'] != e['revision']
        return self._replay(e, self.store.branches(eid))

    def export_branch(self, eid, bid):
        e=self.store.get('experiments',eid)
        b=self.store.get('branches',bid)
        if b['experiment_id']!=eid:
            raise Conflict('branch does not belong to this experiment')
        state=b['initial_state']
        completed=next((ev['details'].get('timestamp_unix_s') for ev in self.store.events(eid) if ev['kind']=='branch_completed' and ev['details'].get('branch_id')==bid),None)
        return {'schema_version':'vivacity.branch/1.0','experiment_id':eid,'branch_id':bid,'world_type':{'mujoco':'object_pregrasp','scipy':'invisible_planet','cloth':'constrained_single_fold'}[e['backend']],'simulation_backend':'mujoco' if e['backend']=='cloth' else e['backend'],'simulator_version':state['version'],'initial_configuration':deepcopy(e['config']),'initial_state_reference':b['parent_state_reference'],'state_encoding':'JSON serialization of mjSTATE_INTEGRATION, not a native binary .mjb file' if e['backend'] in ('mujoco','cloth') else 'JSON numerical observations and fitted-model state','initial_state':state,'final_state':b['final_state'],'action':b['action'],'recorded_frames':b['trace'],'evaluation':b['evaluation'],'constraint_violations':b['evaluation'].get('contact_violations',[]),'success':b['evaluation']['success'],'seed':state['seed'],'configuration_sha256':hashlib.sha256(encode(e['config']).encode()).hexdigest(),'model_hash':state.get('model_hash'),'timestamps':{'submitted_unix_s':e['submitted_at'],'branch_completed_unix_s':completed},'performance':b['performance']}
