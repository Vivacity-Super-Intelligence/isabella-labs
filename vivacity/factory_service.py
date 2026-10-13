"""Bounded asynchronous factory jobs with capability ownership and actual frames."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import threading
import time
import uuid
import json

from .factory import FactoryBackend, FactorySettings, LAYOUT
from .workspace import owner
from .runtime import Busy, Conflict
from .factory_exchange import software,configuration_export,validate_import,METRICS


class FactoryService:
    def __init__(self,workspace):
        self.workspace=workspace
        self.backend=FactoryBackend()
        self.pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='factory')
        self.lock=threading.RLock()
        self.controls={}
        self.live={}
        self.latest_states={}
        self.camera_lock=threading.Lock()
        # A process restart cannot resume an unrecorded native worker.
        with workspace.store.connect() as db:
            rows=db.execute("SELECT owner,payload,kind FROM library_items WHERE kind IN ('factory_run','factory_benchmark') AND json_extract(payload,'$.status') IN ('running','paused','queued')").fetchall()
        for owner_id,payload,kind in rows:
            row=json.loads(payload)
            if row['status'] in ('running','paused','queued'):
                row.update(status='interrupted',error='Runtime restarted; start a new run from the saved configuration.')
                workspace._put(kind,owner_id,row)

    def create(self,settings,token):
        return self._create_owned(settings,owner(token))

    def _create_owned(self,settings,owner_id):
        settings=FactorySettings.model_validate(settings).model_dump()
        w=self.backend.create_world(settings)
        row={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-cell/1.0','created_at':time.time(),
             'software':software(),'config':settings,'world_version':LAYOUT['version'],'engine':{'name':'MuJoCo','version':self.backend.version},
             'frame':self.backend.observe(w),'initial_state':self.backend.snapshot(w),'last_run_id':None,
             'collision_geometry':self.backend.machine_collision_geometry(w)}
        self.workspace._put('factory_cell',owner_id,row)
        return row

    def cell(self,identifier,token):return self.workspace._get(identifier,token,'factory_cell')

    def start(self,identifier,token,mode='conveyor'):
        cell=self.cell(identifier,token)
        if self.backend.create_world(cell['config']).model_hash!=cell['initial_state']['model_hash']:
            raise Conflict('The physical model has changed since this cell was saved. Reset or apply its conditions to create a compatible initial state. Saved results remain inspectable.')
        with self.lock:
            if any(not c['done'].is_set() for c in self.controls.values()):
                raise Busy('A factory run is already using the simulation worker.')
            self.controls.clear()
            self.live.clear()
            self.latest_states.clear()
            row={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-run/1.0','cell_id':identifier,
                 'created_at':time.time(),'status':'queued','phase':'queued','config':cell['config'],
                 'software':cell.get('software'),'world_version':cell['world_version'],'engine':cell['engine'],'initial_state':cell['initial_state'],
                 'frame':cell['frame'],'trace':[],'events':[],'metrics':{},'mode':mode,'error':None}
            control={'stop':threading.Event(),'wake':threading.Event(),'done':threading.Event(),'paused':False,'emergency':False}
            control['wake'].set()
            self.controls[row['id']]=control;self.live[row['id']]=row
            self.workspace._put('factory_run',owner(token),row)
            cell['last_run_id']=row['id'];self.workspace._put('factory_cell',owner(token),cell)
            self.pool.submit(self._run,row['id'],owner(token),control)
            return self._summary(row)

    @staticmethod
    def _summary(row):return {k:deepcopy(v) for k,v in row.items() if k not in ('trace','initial_state','final_state','plans')}

    def _authorize_run(self,identifier,token):
        with self.workspace.store.connect() as db:
            found=db.execute("SELECT 1 FROM library_items WHERE id=? AND owner=? AND kind='factory_run'",(identifier,owner(token))).fetchone()
        if found is None:raise KeyError(identifier)

    def get(self,identifier,token,full=False):
        self._authorize_run(identifier,token)
        with self.lock:
            row=self.live.get(identifier)
            if row is not None:return deepcopy(row) if full else self._summary(row)
        if full:return self.workspace._get(identifier,token,'factory_run')
        with self.workspace.store.connect() as db:
            payload=db.execute("SELECT json_remove(payload,'$.trace','$.initial_state','$.final_state','$.plans') FROM library_items WHERE id=? AND owner=?",(identifier,owner(token))).fetchone()[0]
        return json.loads(payload)

    def command(self,identifier,token,action,kind='factory_run'):
        if kind=='factory_run':self._authorize_run(identifier,token)
        else:self.workspace._get(identifier,token,kind)
        with self.lock:
            c=self.controls.get(identifier);row=self.live.get(identifier)
            if not c or c['done'].is_set():raise Conflict('This run has ended. Start a new run to execute it again.')
            if action in ('stop','emergency_stop'):
                c['emergency']=action=='emergency_stop';c['stop'].set();c['wake'].set()
            elif action=='pause':c['paused']=True;c['wake'].clear()
            elif action=='resume':c['paused']=False;c['wake'].set()
            else:raise ValueError('unknown factory control')
            return self._summary(row)

    def samples(self,identifier,token,after=-1,limit=400):
        self._authorize_run(identifier,token)
        with self.lock:
            row=self.live.get(identifier)
            if row is not None:
                trace=row['trace'];end=min(len(trace),after+1+limit)
                return {'schema_version':'vivacity.factory-samples/1.0','run_id':identifier,'frames':deepcopy(trace[after+1:end]),
                        'next_index':end-1,'total_samples':len(trace),'status':row['status']}
        with self.workspace.store.connect() as db:
            total,status=db.execute("SELECT json_array_length(payload,'$.trace'),json_extract(payload,'$.status') FROM library_items WHERE id=? AND owner=?",(identifier,owner(token))).fetchone()
            rows=db.execute("SELECT value FROM library_items,json_each(payload,'$.trace') WHERE library_items.id=? AND owner=? AND CAST(key AS INTEGER)>? ORDER BY CAST(key AS INTEGER) LIMIT ?",(identifier,owner(token),after,limit)).fetchall()
        return {'schema_version':'vivacity.factory-samples/1.0','run_id':identifier,'frames':[json.loads(r[0]) for r in rows],
                'next_index':min(total-1,after+len(rows)),'total_samples':total,'status':status}

    def _checkpoint(self,row,c):
        if c['stop'].is_set():return False
        if c['paused']:
            with self.lock:row.update(status='paused')
            while c['paused'] and not c['stop'].is_set():c['wake'].wait(.1)
            if c['stop'].is_set():return False
        with self.lock:row['status']='running'
        return True

    def _run(self,identifier,owner_id,c):
        if self.live[identifier]['mode']=='production':
            return self._production(identifier,owner_id,c)
        row=self.live[identifier];w=None;wall=time.perf_counter();steps=0
        try:
            w=self.backend.fork(row['initial_state'])
            with self.lock:row.update(status='running',phase='conveying')
            self.backend.apply_action(w,{'infeed':w.config['conveyor_speed_m_s']})
            with self.lock:row['events'].append({'time_s':0.,'kind':'conveyor_started'})
            self._frame(row,w,'conveying')
            reached=False
            while w.data.time<45.:
                if not self._checkpoint(row,c):break
                tick=time.perf_counter()
                self.backend.step(w,25);steps+=25
                if w.data.body('target').xpos[1]>=-.27 and not reached:
                    reached=True;self.backend.apply_action(w,{'infeed':0})
                    with self.lock:row['events'].append({'time_s':float(w.data.time),'kind':'station_arrival','carton_id':'target'})
                    settle_until=float(w.data.time)+.5
                self._frame(row,w,'station_ready' if reached else 'conveying')
                if reached and w.data.time>=settle_until:break
                c['stop'].wait(max(0.,.05/w.config['realtime_speed']-(time.perf_counter()-tick)))
            status='emergency_stopped' if c['emergency'] else 'stopped' if c['stop'].is_set() else 'completed' if reached else 'failed'
            with self.lock:
                row.update(status=status,phase='station_ready' if reached else status,
                           error=None if reached or c['stop'].is_set() else 'The carton did not reach the station within 45 simulation seconds.')
                row['metrics']={'station_arrivals':int(reached),'simulation_steps':steps,'simulation_time_s':float(w.data.time),
                                'wall_time_s':time.perf_counter()-wall,'cartons_sorted':0,'scope':'conveyor transport acceptance only'}
                row['final_state']=self.backend.snapshot(w)
        except Exception as exc:
            with self.lock:row.update(status='failed',phase='failed',error=str(exc)[:300])
        finally:
            self.workspace._put('factory_run',owner_id,row)
            c['done'].set()

    def _production(self,identifier,owner_id,c,pace=True,finalize_control=True,checkpoint_record=None):
        from .factory_controller import ProductionController,FactoryFault
        row=self.live[identifier];wall=time.perf_counter();w=None;controller=None
        def event(value):
            with self.lock:row['events'].append(value)
            if w is not None:self._frame(row,w,value['kind'])
        try:
            w=self.backend.fork(row['initial_state'])
            with self.lock:row.update(status='running',phase='initializing')
            self._frame(row,w,'initializing')
            controller=ProductionController(self.backend,w,on_frame=lambda w,p:self._frame(row,w,p),
                                           on_event=event,checkpoint=lambda:self._checkpoint(checkpoint_record if checkpoint_record is not None else row,c),pace=pace)
            metrics=controller.run()
            with self.lock:row.update(status='completed',phase='completed',metrics=metrics)
        except InterruptedError:
            with self.lock:row.update(status='emergency_stopped' if c['emergency'] else 'stopped',phase='stopped')
        except Exception as exc:
            with self.lock:row.update(status='failed',phase=getattr(exc,'kind','runtime_failure'),error=str(exc)[:500])
        finally:
            if w is not None:
                self._frame(row,w,row['phase'])
                with self.lock:
                    row['final_state']=self.backend.snapshot(w)
                    row['plans']=controller.plans if controller else []
                    row['metrics'].update(cartons_sorted=controller.sorted if controller else 0,
                        station_arrivals=controller.arrivals if controller else 0,
                        simulation_steps=controller.steps if controller else 0,simulation_time_s=float(w.data.time),
                        wall_time_s=time.perf_counter()-wall)
            try:self.workspace._put('factory_run',owner_id,row)
            finally:
                if finalize_control:c['done'].set()

    def start_benchmark(self,identifier,token,request):
        from .factory_benchmark import BenchmarkRequest,definition
        cell=self.cell(identifier,token);settings=BenchmarkRequest.model_validate(request).model_dump()
        spec=definition(cell['config'],settings)
        with self.lock:
            if any(not c['done'].is_set() for c in self.controls.values()):raise Busy('A factory experiment is already using the simulation worker.')
            self.controls.clear();self.live.clear();self.latest_states.clear()
            row={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-benchmark-record/1.0','created_at':time.time(),
                 'name':settings['name'],'status':'queued','phase':'queued','cell_id':identifier,
                 'software':software(),'definition':spec,'request':settings,'engine':cell['engine'],'controller_version':'factory-1',
                 'trials':[],'comparison':{},'error':None,'total_trials':len(spec['trial_configurations'])}
            c={'stop':threading.Event(),'wake':threading.Event(),'done':threading.Event(),'paused':False,'emergency':False}
            c['wake'].set();self.controls[row['id']]=c;self.live[row['id']]=row
            self.workspace._put('factory_benchmark',owner(token),row)
            self.pool.submit(self._benchmark,row,owner(token),c)
            return deepcopy(row)

    def benchmark(self,identifier,token):
        row=self.workspace._get(identifier,token,'factory_benchmark')
        with self.lock:return deepcopy(self.live.get(identifier,row))

    def benchmarks(self,token):
        rows=self.workspace.list(token,'factory_benchmark')
        with self.lock:return [deepcopy(self.live.get(r['id'],r)) for r in rows]

    def history(self,token):
        with self.workspace.store.connect() as db:
            rows=db.execute("SELECT json_remove(payload,'$.trace','$.initial_state','$.final_state','$.plans') FROM library_items WHERE owner=? AND kind='factory_run' ORDER BY rowid DESC LIMIT 30",(owner(token),)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def _benchmark(self,row,owner_id,c):
        from .factory_benchmark import comparison
        started=time.perf_counter();cpu=time.thread_time()
        try:
            for number,trial in enumerate(row['definition']['trial_configurations']):
                if not self._checkpoint(row,c):break
                cell=self._create_owned(trial['config'],owner_id);identifier=str(uuid.uuid4())
                run={'id':identifier,'schema_version':'vivacity.factory-run/1.0','cell_id':cell['id'],
                     'benchmark_id':row['id'],'created_at':time.time(),'status':'queued','phase':'queued','config':trial['config'],
                     'software':row.get('software'),'world_version':row['definition']['world_version'],'engine':row['engine'],'initial_state':cell['initial_state'],
                     'frame':cell['frame'],'trace':[],'events':[],'metrics':{},'mode':'production','error':None}
                cell['last_run_id']=identifier;self.workspace._put('factory_cell',owner_id,cell)
                with self.lock:
                    self.live[identifier]=run;row.update(phase=f'{trial["partition"]}: {trial["condition"]}',active_run_id=identifier)
                self.workspace._put('factory_run',owner_id,run)
                self._production(identifier,owner_id,c,pace=False,finalize_control=False,checkpoint_record=row)
                result={k:trial[k] for k in ('partition','repeat','condition','config')}
                result.update(run_id=identifier,status=run['status'],failure_kind=run['phase'] if run['status']!='completed' else None,
                              metrics=run['metrics'],error=run['error'])
                with self.lock:
                    row['trials'].append(result);row['comparison']=comparison(row['trials'])
                    self.live.pop(identifier,None);self.latest_states.pop(identifier,None)
                self.workspace._put('factory_benchmark',owner_id,row)
                del run
                if c['stop'].is_set():break
            with self.lock:row.update(status='stopped' if c['stop'].is_set() else 'completed',phase='finished',active_run_id=None,active_frame=None)
        except Exception as exc:
            with self.lock:row.update(status='failed',phase='failed',error=str(exc)[:500])
        finally:
            with self.lock:row.update(wall_time_s=time.perf_counter()-started,worker_cpu_time_s=time.thread_time()-cpu)
            try:self.workspace._put('factory_benchmark',owner_id,row)
            finally:c['done'].set()

    def _frame(self,row,w,phase):
        frame=self.backend.observe(w)|{'phase':phase}
        with self.lock:
            self.latest_states[row['id']]=self.backend.snapshot(w)
            row['frame']=frame;row['phase']=phase
            parent=self.live.get(row.get('benchmark_id'))
            if parent is not None:parent.update(active_phase=phase,active_time_s=frame['time'],active_frame=frame)
            if not row['trace'] or frame['time']>row['trace'][-1]['time']:row['trace'].append(frame)

    def observation(self,identifier,token,source='latest'):
        from .factory_vision import observe_camera
        cell=self.cell(identifier,token);state=cell['initial_state']
        if source=='latest' and cell['last_run_id']:
            run=self.workspace._get(cell['last_run_id'],token,'factory_run')
            with self.lock:state=deepcopy(self.latest_states.get(run['id'],run.get('final_state',state)))
        if not self.camera_lock.acquire(blocking=False):raise Busy('The simulated camera is capturing another frame. Try again shortly.')
        try:
            w=self.backend.fork(state)
            return {'camera':observe_camera(w),'ground_truth':self.backend.observe(w)}
        finally:self.camera_lock.release()

    def export_configuration(self,identifier,token,kind='configuration'):
        benchmark=self.benchmark(identifier,token) if kind=='benchmark' else None
        cell=self.cell(benchmark['cell_id'] if benchmark else identifier,token)
        if not cell.get('software'):
            raise Conflict('This record predates versioned interchange. Reset or apply its conditions to export a reproducible configuration; its recorded results remain available.')
        return configuration_export(cell,benchmark)

    def import_configuration(self,value,token):
        value=validate_import(value,self.backend)
        cell=self.create(value['configuration'],token)
        receipt={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-import/1.0','created_at':time.time(),
                 'cell_id':cell['id'],'source_file':value,'status':'configuration_imported_not_executed'}
        self.workspace._put('factory_import',owner(token),receipt)
        return {'cell':cell,'benchmark_request':value['benchmark_request'],'receipt_id':receipt['id'],
                'message':'Compatible configuration imported. No experiment has started. Run it to produce new verified results.'}

    def export_record(self,identifier,token):
        row=self.get(identifier,token,full=True)
        if row['status'] in ('running','paused','queued'):raise Conflict('Stop or finish the run before exporting its complete record.')
        return {'schema_version':'vivacity.factory-record-export/1.0','units':'SI','coordinates':'right-handed Z-up; quaternion wxyz',
                'metric_definitions':METRICS,'missing_data':'null means unavailable; missing fields were not measured.',
                'provenance':'Saved backend MuJoCo execution; imported measurements are never accepted as a verified run.',
                'record':row}

    def close(self):
        for control in self.controls.values():control['stop'].set();control['wake'].set()
        self.pool.shutdown(wait=True,cancel_futures=True)
