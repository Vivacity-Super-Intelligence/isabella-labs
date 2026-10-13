import {useEffect,useState} from 'react';
import FactoryView,{type FactoryViewMode} from './FactoryView';
import {factoryApi,factoryDefaults,type FactoryCell,type FactoryRun} from './factoryApi';
import {APIError,errorMessage} from './api';
import './factory.css';

export default function FactoryWorkspace(){
 const [mode,setMode]=useState<FactoryViewMode>('fidelity'),[cell,setCell]=useState<FactoryCell|null>(null),[run,setRun]=useState<FactoryRun|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const active=!!run&&['queued','running','paused'].includes(run.status);
 async function load(){
  const id=localStorage.getItem('vivacity:factory-cell');let value:FactoryCell;
  try{value=id?await factoryApi.cell(id):await factoryApi.create(factoryDefaults);}catch(e){if(e instanceof APIError&&e.status===404)value=await factoryApi.create(factoryDefaults);else throw e;}
  setCell(value);localStorage.setItem('vivacity:factory-cell',value.id);
  if(value.last_run_id)setRun(await factoryApi.run(value.last_run_id));
 }
 useEffect(()=>{load().catch(e=>setError(errorMessage(e)));},[]);
 useEffect(()=>{if(!active||!run)return;let alive=true,timer:ReturnType<typeof setTimeout>;
  async function poll(){try{const value=await factoryApi.run(run!.id);if(alive){setRun(value);setError(null);}}catch(e){if(alive)setError(errorMessage(e));}finally{if(alive)timer=setTimeout(poll,160);}}
  timer=setTimeout(poll,160);return()=>{alive=false;clearTimeout(timer);};
 },[run?.id,active]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError(null);try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const command=(value:'pause'|'resume'|'stop'|'emergency_stop')=>action(async()=>{if(run)setRun(await factoryApi.control(run.id,value));});
 const frame=run?.frame??cell?.frame??null;
 return <section className="factory-workspace">
  <header className="factory-heading"><div><span className="factory-eyebrow">Production research / Cell 01</span><h1>Carton sorting</h1></div><label>View<select value={mode} onChange={e=>setMode(e.target.value as FactoryViewMode)}><option value="fidelity">High fidelity</option><option value="performance">Performance</option></select></label></header>
  {error&&<div role="alert" className="notice">{error} <button onClick={()=>action(load)}>Reconnect</button></div>}
  <FactoryView frame={frame} mode={mode} status={run?.status??'idle'}/>
  <div className="factory-control-bar"><div><strong role="status">{run?.status??(cell?'Ready':'Connecting')}</strong><span data-testid="factory-clock">{(frame?.time??0).toFixed(3)} s · MuJoCo simulation time</span></div><div className="factory-actions">
   <button className="primary" disabled={!cell||active||busy} onClick={()=>action(async()=>{if(cell)setRun(await factoryApi.start(cell.id));})}>Start conveyor test</button>
   <button disabled={!active||busy} onClick={()=>command(run?.status==='paused'?'resume':'pause')}>{run?.status==='paused'?'Resume':'Pause'}</button>
   <button disabled={!active||busy} onClick={()=>command('stop')}>Stop</button>
   <button className="factory-estop" disabled={!active||busy} onClick={()=>command('emergency_stop')}>Emergency simulation stop</button>
   <button disabled={active||busy||!cell} onClick={()=>action(async()=>{const value=await factoryApi.create(cell?.config??factoryDefaults);setCell(value);setRun(null);localStorage.setItem('vivacity:factory-cell',value.id);})}>Reset</button>
  </div></div>
  <p className="factory-stage-note">Conveyor acceptance: motor-driven rollers transport free cartons to the robot station. Robot sorting is not enabled in this stage.</p>
  <details className="factory-readout"><summary>Measured transport and event log</summary><dl>{Object.entries(frame?.conveyors??{}).map(([name,value])=><div key={name}><dt>{name.replaceAll('_',' ')}</dt><dd>{value.surface_speed_m_s.toFixed(3)} m/s</dd></div>)}</dl><ol>{run?.events.map((event,i)=><li key={i}>{event.time_s.toFixed(3)} s · {event.kind.replaceAll('_',' ')}</li>)}</ol></details>
 </section>;
}
