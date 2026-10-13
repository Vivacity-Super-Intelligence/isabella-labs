"""Bounded asynchronous factory jobs with capability ownership and actual frames."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import threading
import time
import uuid

from .factory import FactoryBackend, FactorySettings, LAYOUT
from .workspace import owner
from .runtime import Busy, Conflict


class FactoryService:
    def __init__(self,workspace):
        self.workspace=workspace
        self.backend=FactoryBackend()
        self.pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='factory')
        self.lock=threading.RLock()
        self.controls={}
        self.live={}
        # A process restart cannot resume an unrecorded native worker.
        with workspace.store.connect() as db:
            rows=db.execute("SELECT owner,payload FROM library_items WHERE kind='factory_run'").fetchall()
        import json
        for owner_id,payload in rows:
            row=json.loads(payload)
            if row['status'] in ('running','paused','queued'):
                row.update(status='interrupted',error='Runtime restarted; start a new run from the saved configuration.')
                workspace._put('factory_run',owner_id,row)

    def create(self,settings,token):
        settings=FactorySettings.model_validate(settings).model_dump()
        w=self.backend.create_world(settings)
        row={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-cell/1.0','created_at':time.time(),
             'config':settings,'world_version':LAYOUT['version'],'engine':{'name':'MuJoCo','version':self.backend.version},
             'frame':self.backend.observe(w),'initial_state':self.backend.snapshot(w),'last_run_id':None}
        self.workspace._put('factory_cell',owner(token),row)
        return row

    def cell(self,identifier,token):return self.workspace._get(identifier,token,'factory_cell')

    def start(self,identifier,token,mode='conveyor'):
        cell=self.cell(identifier,token)
        with self.lock:
            if any(not c['done'].is_set() for c in self.controls.values()):
                raise Busy('A factory run is already using the simulation worker.')
            self.controls.clear()
            self.live.clear()
            row={'id':str(uuid.uuid4()),'schema_version':'vivacity.factory-run/1.0','cell_id':identifier,
                 'created_at':time.time(),'status':'queued','phase':'queued','config':cell['config'],
                 'world_version':cell['world_version'],'engine':cell['engine'],'initial_state':cell['initial_state'],
                 'frame':cell['frame'],'trace':[],'events':[],'metrics':{},'mode':mode,'error':None}
            control={'stop':threading.Event(),'wake':threading.Event(),'done':threading.Event(),'paused':False,'emergency':False}
            control['wake'].set()
            self.controls[row['id']]=control;self.live[row['id']]=row
            self.workspace._put('factory_run',owner(token),row)
            cell['last_run_id']=row['id'];self.workspace._put('factory_cell',owner(token),cell)
            self.pool.submit(self._run,row['id'],owner(token),control)
            return self._summary(row)

    @staticmethod
    def _summary(row):return {k:deepcopy(v) for k,v in row.items() if k not in ('trace','initial_state','final_state')}

    def get(self,identifier,token,full=False):
        stored=self.workspace._get(identifier,token,'factory_run')
        with self.lock:
            row=self.live.get(identifier,stored)
            return deepcopy(row) if full else self._summary(row)

    def command(self,identifier,token,action):
        self.workspace._get(identifier,token,'factory_run')
        with self.lock:
            c=self.controls.get(identifier);row=self.live.get(identifier)
            if not c or c['done'].is_set():raise Conflict('This run has ended. Start a new run to execute it again.')
            if action in ('stop','emergency_stop'):
                c['emergency']=action=='emergency_stop';c['stop'].set();c['wake'].set()
            elif action=='pause':c['paused']=True;c['wake'].clear()
            elif action=='resume':c['paused']=False;c['wake'].set()
            else:raise ValueError('unknown factory control')
            return self._summary(row)

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

    def _production(self,identifier,owner_id,c):
        from .factory_controller import ProductionController,FactoryFault
        row=self.live[identifier];wall=time.perf_counter();w=None;controller=None
        def event(value):
            with self.lock:row['events'].append(value)
        try:
            w=self.backend.fork(row['initial_state'])
            with self.lock:row.update(status='running',phase='initializing')
            self._frame(row,w,'initializing')
            controller=ProductionController(self.backend,w,on_frame=lambda w,p:self._frame(row,w,p),
                                           on_event=event,checkpoint=lambda:self._checkpoint(row,c))
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
            self.workspace._put('factory_run',owner_id,row)
            c['done'].set()

    def _frame(self,row,w,phase):
        frame=self.backend.observe(w)|{'phase':phase}
        with self.lock:
            row['frame']=frame;row['phase']=phase
            if not row['trace'] or frame['time']>row['trace'][-1]['time']:row['trace'].append(frame)

    def close(self):
        for control in self.controls.values():control['stop'].set();control['wake'].set()
        self.pool.shutdown(wait=True,cancel_futures=True)
