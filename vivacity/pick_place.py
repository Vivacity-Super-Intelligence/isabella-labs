"""Contact-driven Panda pickup. The cube is a free body, never attached or repositioned.

The benchmark uses synthetic Coulomb friction, gravity compensation on the arm,
and the unmodified Menagerie finger actuator/collision pads. It is not calibrated
to a physical robot. All task evidence is sampled from integrated MuJoCo state.
"""
from copy import deepcopy
import hashlib
import time
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np
from scipy.spatial.transform import Rotation

from .robotics import ASSET_DIR, DOWN, RobotWorld, RoboticsBackend, asset_digest


class PickPlaceBackend(RoboticsBackend):
    action_schema = {'type': 'pick_place', 'joints': 7, 'gripper_control': '0 closed, 255 open',
                     'milestone': 'physical_pick_and_place', 'planner': 'DLS pose IK; collision-screened joint segments'}

    def create_world(self, config, seed):
        root = ET.parse(ASSET_DIR / 'panda.xml').getroot()
        root.find('compiler').set('meshdir', str(ASSET_DIR / 'assets'))
        root.find('option').set('timestep', '.002')
        root.find('option').set('cone', 'elliptic')
        root.find('option').set('impratio', '5')
        root.remove(root.find('keyframe'))
        for body in root.findall('.//body'):
            body.set('gravcomp', '1')
        hand = root.find(".//body[@name='hand']")
        ET.SubElement(hand, 'site', name='pregrasp', pos='0 0 .103', size='.008')
        wb = root.find('worldbody')
        ET.SubElement(wb, 'geom', name='ground', type='plane', pos='0 0 -.8', size='2 2 .1')
        ET.SubElement(wb, 'geom', name='table', type='box', pos='.4 0 -.04', size='.7 .65 .04', friction='1 .005 .0001')
        target = ET.SubElement(wb, 'body', name='target', pos=' '.join(map(str, config['cube_position'])))
        ET.SubElement(target, 'freejoint', name='cube_free')
        ET.SubElement(target, 'geom', name='cube', type='box', size='.025 .025 .025',
                      mass=str(config['cube_mass']), friction=f"{config['cube_friction']} .005 .0001",
                      condim='4', solref='.004 1', rgba='.05 .35 .9 1')
        obstacle = ET.SubElement(wb, 'body', name='obstacle', pos=' '.join(map(str, config['obstacle_position'])))
        ET.SubElement(obstacle, 'geom', name='obstacle_geom', type='box',
                      size=' '.join(map(str, config['obstacle_size'])),
                      contype='1' if config['obstacle_enabled'] else '0',
                      conaffinity='1' if config['obstacle_enabled'] else '0')
        model = mj.MjModel.from_xml_string(ET.tostring(root, encoding='unicode'))
        data = mj.MjData(model)
        data.qpos[:9] = [0, 0, 0, -1.57079, 0, 1.57079, -.7853, .04, .04]
        data.ctrl[:7] = data.qpos[:7]; data.ctrl[7] = 255
        mj.mj_forward(model, data)
        root.find('compiler').set('meshdir', 'assets')
        digest = hashlib.sha256((ET.tostring(root, encoding='unicode') + asset_digest() + self.version).encode()).hexdigest()
        return RobotWorld(model, data, deepcopy(config), seed, digest)

    def contact_evidence(self, world):
        m, d = world.model, world.data
        fingers = set(); force_total = 0.; support = False
        for i, c in enumerate(d.contact[:d.ncon]):
            if c.dist > .001:
                continue
            names = [mj.mj_id2name(m, mj.mjtObj.mjOBJ_BODY, int(m.geom_bodyid[g])) for g in (c.geom1, c.geom2)]
            geoms = [mj.mj_id2name(m, mj.mjtObj.mjOBJ_GEOM, int(g)) for g in (c.geom1, c.geom2)]
            if 'cube' not in geoms:
                continue
            force = np.zeros(6); mj.mj_contactForce(m, d, i, force)
            force_total += abs(float(force[0]))
            for finger in ('left_finger', 'right_finger'):
                if finger in names and force[0] > .01:
                    fingers.add(finger)
            support |= 'table' in geoms and force[0] > .01
        return {'finger_contacts': sorted(fingers), 'bilateral_grasp': len(fingers) == 2,
                'cube_contact_normal_force_n': force_total, 'table_support': bool(support)}

    def contacts(self, world):
        # Finger/cube contact is the intended grasp. All other robot contacts
        # retain the reaching adapter's prohibited-contact classification.
        contacts = super().contacts(world)
        return [c for c in contacts if not ('cube' in c['geoms'] and
                any(b in ('left_finger', 'right_finger') for b in c['bodies']))]

    def observe(self, world):
        observation = super().observe(world)
        observation.update(cube_position=world.data.body('target').xpos.tolist(),
                           cube_quaternion_wxyz=world.data.body('target').xquat.tolist(),
                           placement_position=world.config['placement_position'],
                           grasp=self.contact_evidence(world), source='live_mujoco_state')
        return observation

    def pose_ik(self, world, goal, start):
        m = world.model; d = mj.MjData(m); d.qpos[:] = world.data.qpos; d.qpos[:7] = start
        sid = m.site('pregrasp').id
        jp, jr = np.zeros((3, m.nv)), np.zeros((3, m.nv))
        for _ in range(250):
            mj.mj_kinematics(m, d); mj.mj_comPos(m, d)
            dp = np.asarray(goal) - d.site_xpos[sid]
            dr = Rotation.from_matrix(DOWN @ d.site_xmat[sid].reshape(3, 3).T).as_rotvec()
            if np.linalg.norm(dp) < .0002 and np.linalg.norm(dr) < .003:
                return d.qpos[:7].copy(), True
            mj.mj_jacSite(m, d, jp, jr, sid)
            jac = np.vstack([jp[:, :7], .35 * jr[:, :7]])
            step = jac.T @ np.linalg.solve(jac @ jac.T + .003**2 * np.eye(6), np.r_[dp, .35 * dr])
            step *= min(1., .15 / max(np.linalg.norm(step), 1e-9))
            d.qpos[:7] = np.clip(d.qpos[:7] + step, m.jnt_range[:7, 0] + .005, m.jnt_range[:7, 1] - .005)
        return d.qpos[:7].copy(), False

    def candidates(self, world, count, iterations):
        tic = time.perf_counter(); actions = []
        cube = np.asarray(world.data.body('target').xpos)
        dest = np.asarray(world.config['placement_position'])
        rng = np.random.default_rng(world.seed)
        for index in range(count):
            height = .19 if index == 0 else float(rng.uniform(.17, .25))
            speed = .32 if index == 0 else float(rng.uniform(.27, .36))
            specs = [('approach', [cube[0], cube[1], height], 255, .3),
                     ('descend', [cube[0], cube[1], .038], 255, .3),
                     ('close', [cube[0], cube[1], .038], 0, .7),
                     ('lift', [cube[0], cube[1], height], 0, .3),
                     ('transport', [dest[0], dest[1], height], 0, .3),
                     ('lower', [dest[0], dest[1], .038], 0, .3),
                     ('release', [dest[0], dest[1], .038], 255, .6),
                     ('retract', [dest[0], dest[1], height], 255, .7)]
            q = world.data.qpos[:7].copy(); stages = []; converged = True
            for phase, pose, gripper, dwell in specs:
                goal, ok = self.pose_ik(world, pose, q); converged &= ok
                duration = 0. if phase in ('close', 'release') else max(.6, float(np.max(np.abs(goal-q))) / speed)
                stages.append({'phase': phase, 'start': q.tolist(), 'goal': goal.tolist(),
                               'duration_s': duration, 'dwell_s': dwell, 'gripper': gripper, 'tool_position': pose})
                q = goal
            # Actual kinematic contact checking of the robot against the world.
            scratch = RobotWorld(world.model, mj.MjData(world.model), world.config, world.seed, world.model_hash)
            scratch.data.qpos[:] = world.data.qpos
            rejected = None
            for stage in stages:
                scratch.data.qpos[7:9] = .04 if stage['gripper'] else .023
                for t in np.linspace(0, 1, 12):
                    scratch.data.qpos[:7] = np.asarray(stage['start']) * (1-t) + np.asarray(stage['goal']) * t
                    mj.mj_forward(scratch.model, scratch.data)
                    if self.contacts(scratch):
                        rejected = 'kinematic_collision'; break
                if rejected:
                    break
            actions.append({'kind': 'pick_place', 'planner': 'staged_dls_contact_pick_place', 'candidate_index': index,
                            'seed': world.seed, 'stages': stages, 'lift_height_m': height, 'speed_rad_s': speed,
                            'planning_feasible': converged and not rejected,
                            'screening_rejection': rejected or (None if converged else 'ik_failure'),
                            'ik': {'converged': bool(converged)}})
        return actions, time.perf_counter()-tic

    def apply_action(self, world, action):
        if action.get('kind') != 'pick_place' or len(action.get('stages', [])) != 8:
            raise ValueError('expected eight-stage contact pick-and-place action')
        if not np.allclose(action['stages'][0]['start'], world.data.qpos[:7], atol=1e-6, rtol=0):
            raise ValueError('action must start at restored parent state')
        for stage in action['stages']:
            for key in ('start', 'goal'):
                q = np.asarray(stage[key])
                if q.shape != (7,) or not np.isfinite(q).all():
                    raise ValueError('finite seven-joint targets required')
            if not (0 <= stage['duration_s'] <= 20 and 0 <= stage['dwell_s'] <= 2 and 0 <= stage['gripper'] <= 255):
                raise ValueError('stage command outside resource limits')
        world.action = deepcopy(action)

    def search(self, world, settings, emit):
        """Distinct timed plans; reuse measured kinematics for identical geometry.

        Height templates are screened once. Each proposal varies arm speed and
        close/release dwell, then receives its own finite/limit/horizon checks.
        Timing screening cannot prove a frictional grasp: only physics can.
        """
        tic=time.perf_counter();templates,_=self.candidates(world,8,settings['planner_iterations'])
        rng=np.random.default_rng(world.seed);eligible=[];distinct=set();digest=hashlib.sha256()
        rejected={'kinematic_collision':0,'ik_failure':0,'simulation_horizon':0}
        total=settings['search_candidates']
        for i in range(total):
            action=deepcopy(templates[i%len(templates)])
            speed=float(rng.uniform(.27,.36));action['speed_rad_s']=speed;action['candidate_index']=i
            for stage in action['stages']:
                if stage['duration_s']:
                    stage['duration_s']=max(.6,float(np.max(np.abs(np.asarray(stage['goal'])-stage['start'])))/speed)
                if stage['phase']=='close':stage['dwell_s']=float(rng.uniform(.6,.9))
                if stage['phase']=='release':stage['dwell_s']=float(rng.uniform(.5,.8))
            duration=sum(s['duration_s']+s['dwell_s'] for s in action['stages'])
            signature=hashlib.sha256(str(action['stages']).encode()).digest();distinct.add(signature);digest.update(signature)
            reason=action['screening_rejection']
            if not reason and duration>=settings['max_simulation_seconds']:reason='simulation_horizon'
            if reason:rejected[reason]+=1
            else:eligible.append((duration,i,action))
            if (i+1)%1000==0 or i+1==total:
                emit({'stage':'screening','generated':i+1,'screened':i+1,'rejected':sum(rejected.values()),
                      'screening_passed':len(eligible),'message':f'{i+1:,} distinct timed pickup plans checked; {len(eligible):,} passed screening.'})
        eligible.sort(key=lambda item:(item[0],item[1]))
        actions=[item[2] for item in eligible[:settings['physics_budget']]]
        if not actions:actions=[templates[0]]
        summary={'generated':total,'distinct_generated':len(distinct),'screened':total,'rejected':sum(rejected.values()),
                 'screening_passed':len(eligible),'promoted_to_physics':len(actions),
                 'candidate_catalog_sha256':digest.hexdigest(),'rejection_reasons':rejected,
                 'kinematic_templates_checked':len(templates),'diagnostic_rollouts':int(not eligible),
                 'sampling':'seeded lift-height templates and distinct speed/close-dwell/release-dwell commands',
                 'screening_scope':'actual template IK/kinematic contacts plus per-candidate timing/horizon checks; no dynamic success claim',
                 'ranking_objective':'successful execution, measured duration, placement error, candidate index'}
        emit(summary|{'stage':'screening_complete','message':f'{len(eligible):,} screened plans eligible; {len(actions)} promoted to actual physics.'})
        return actions,time.perf_counter()-tic,summary

    def simulate(self, world, limits):
        tic = time.perf_counter(); d, m = world.data, world.model
        start_time = float(d.time); trace = [self.observe(world) | {'phase': 'initializing'}]
        failure = None; violations = []; steps = 0; milestones = []; retention = True; lifted = False
        max_height = float(d.body('target').xpos[2]); max_tracking = 0.
        if not world.action['planning_feasible']:
            failure = 'planning_failure'
        for stage in world.action['stages']:
            if failure:
                break
            phase = stage['phase']; duration = stage['duration_s']; total = duration + stage['dwell_s']
            for i in range(int(np.ceil(total / m.opt.timestep))):
                if limits.get('cancel_event') and limits['cancel_event'].is_set():
                    failure = 'cancelled'; break
                alpha = min(1., (i+1) * m.opt.timestep / max(duration, m.opt.timestep))
                blend = alpha * alpha * (3-2*alpha)
                d.ctrl[:7] = np.asarray(stage['start']) * (1-blend) + np.asarray(stage['goal']) * blend
                d.ctrl[7] = stage['gripper']
                mj.mj_step(m, d); mj.mj_forward(m, d); steps += 1
                max_tracking = max(max_tracking, float(np.max(np.abs(d.qpos[:7]-d.ctrl[:7]))))
                evidence = self.contact_evidence(world)
                height = float(d.body('target').xpos[2]); max_height = max(max_height, height)
                if phase in ('lift', 'transport', 'lower') and height > .075:
                    lifted = True
                    if not evidence['bilateral_grasp']:
                        retention = False; failure = 'dropped_object'
                if phase == 'transport' and height < .07:
                    retention = False; failure = 'dropped_object'
                contacts = self.contacts(world)
                if contacts:
                    failure = 'collision_failure'; violations.extend(contacts)
                if not np.isfinite(d.qpos).all() or np.any(d.warning.number) or max_tracking > .35:
                    failure = 'controller_failure'
                if np.any(d.qpos[:7] < m.jnt_range[:7, 0]-.002) or np.any(d.qpos[:7] > m.jnt_range[:7, 1]+.002):
                    failure = 'joint_limit_failure'
                if d.time-start_time >= limits['max_simulation_seconds'] or time.perf_counter()-tic > limits.get('max_wall_seconds', 120):
                    failure = 'timeout'
                if steps % 25 == 0 or failure:
                    frame = self.observe(world) | {'phase': phase}
                    trace.append(frame)
                    if limits.get('on_frame'):
                        limits['on_frame'](frame)
                        if limits.get('realtime'):
                            time.sleep(max(0., float(d.time-start_time)-(time.perf_counter()-tic)))
                if failure:
                    break
            evidence = self.contact_evidence(world)
            milestones.append({'phase': phase, 'time': float(d.time), 'cube_position': d.body('target').xpos.tolist(), **evidence})
            if phase == 'close' and not evidence['bilateral_grasp'] and not failure:
                failure = 'grasp_failure'
        trace.append(self.observe(world) | {'phase': 'evaluating'})
        return {'trace': trace, 'failure': failure, 'contact_violations': violations, 'milestones': milestones,
                'lifted': lifted, 'retained_during_transport': retention and lifted,
                'max_cube_height_m': max_height, 'max_tracking_error_rad': max_tracking,
                'simulation_steps': steps, 'execution_duration_s': float(d.time-start_time),
                'physics_wall_seconds': time.perf_counter()-tic}

    def evaluate(self, world, result):
        position = world.data.body('target').xpos.copy()
        error = float(np.linalg.norm(position-np.asarray(world.config['placement_position'])))
        evidence = self.contact_evidence(world)
        closed = next((m for m in result['milestones'] if m['phase'] == 'close'), {})
        failure = result['failure']
        if not failure and not result['lifted']:
            failure = 'lift_failure'
        if not failure and (error > .025 or not evidence['table_support'] or np.linalg.norm(world.data.qvel[9:]) > .05):
            failure = 'placement_failure'
        if not failure and (evidence['bilateral_grasp'] or world.data.ctrl[7] < 200):
            failure = 'release_failure'
        return {'success': failure is None, 'status': failure or 'execution_success',
                'milestone': 'physical_pick_and_place', 'planning_feasible': world.action['planning_feasible'],
                'goal_error_m': error, 'final_cube_position': position.tolist(), 'grasp_established': closed.get('bilateral_grasp', False),
                'lifted': result['lifted'], 'retained_during_transport': result['retained_during_transport'],
                'released': bool(not evidence['bilateral_grasp'] and world.data.ctrl[7] >= 200),
                'table_supported': evidence['table_support'], 'max_cube_height_m': result['max_cube_height_m'],
                'max_tracking_error_rad': result['max_tracking_error_rad'], 'contact_violations': result['contact_violations'],
                'phase_evidence': result['milestones'], 'execution_duration_s': result['execution_duration_s']}


class RobotAdapter:
    """Keep persisted reach scenes compatible while selecting a domain-specific task."""
    version = RoboticsBackend.version
    action_schema = {'tasks': {'reach': RoboticsBackend.action_schema, 'pick_place': PickPlaceBackend.action_schema}}

    def __init__(self):
        self.reach = RoboticsBackend(); self.pick_place = PickPlaceBackend()

    def backend(self, config):
        return self.pick_place if config.get('task') == 'pick_place' else self.reach

    def create_world(self, config, seed):
        return self.backend(config).create_world(config, seed)

    def fork(self, state):
        return self.backend(state['config']).fork(state)

    def commit(self, state):
        return self.backend(state['config']).commit(state)

    def snapshot(self, world):
        return self.backend(world.config).snapshot(world)

    def observe(self, world):
        return self.backend(world.config).observe(world)

    def candidates(self, world, count, iterations):
        return self.backend(world.config).candidates(world, count, iterations)

    def search(self, world, settings, emit):
        return self.pick_place.search(world,settings,emit)

    def contacts(self, world):
        return self.backend(world.config).contacts(world)

    def apply_action(self, world, action):
        return self.backend(world.config).apply_action(world, action)

    def simulate(self, world, limits):
        return self.backend(world.config).simulate(world, limits)

    def evaluate(self, world, result):
        return self.backend(world.config).evaluate(world, result)

    def replay(self, branch):
        return self.backend(branch['initial_state']['config']).replay(branch)
