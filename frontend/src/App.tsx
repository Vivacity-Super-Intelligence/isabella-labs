import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowsClockwise, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { API, api, errorMessage } from './api';
import { format, robotFrame, clothFrame, scienceObservation, type Backend, type Branch, type RobotFrame, type ClothFrame } from './domain';
import Settings from './Settings';
import ClothSettings from './ClothSettings';
import TechnicalInspector from './TechnicalInspector';
import ResultCard from './ResultCard';
import Brand from './Brand';

const RobotView=lazy(()=>import('./RobotView'));
const ScienceView=lazy(()=>import('./ScienceView'));
const ClothView=lazy(()=>import('./ClothView'));
const ImportWorld=lazy(()=>import('./ImportWorld'));

export default function App(){
  const [backend,setBackend]=useState<Backend>(()=>{try{const value=localStorage.getItem('vivacity:lab');if(value==='mujoco'||value==='cloth'||value==='scipy')return value;}catch{/* Optional storage. */}return 'mujoco';});
  const [page,setPage]=useState<'workspace'|'import'>('workspace');
  const rt=useRuntime(backend),robotics=backend!=='scipy',cloth=backend==='cloth';
  const [branchId,setBranchId]=useState<string|null>(null),[editing,setEditing]=useState(false),[downloadError,setDownloadError]=useState<string|null>(null);
  const compatible=rt.world?.backend===backend,branches=compatible?rt.branches:[];
  const ranked=useMemo(()=>{
    const ids=rt.experiment?.result.top_feasible_branch_ids as string[]|undefined;
    if(ids)return ids.map(id=>branches.find(b=>b.id===id)).filter((b):b is Branch=>!!b&&b.evaluation.success).slice(0,3);
    return branches.filter(b=>b.evaluation.success&&b.action.execution_role!=='authoritative_execution')
      .sort((a,b)=>Number(b.id===rt.experiment?.selected_branch_id)-Number(a.id===rt.experiment?.selected_branch_id)).slice(0,3);
  },[branches,rt.experiment]);
  const selected=branches.find(b=>b.id===branchId)??ranked[0];
  const currentFrame=compatible?(cloth?clothFrame(rt.observation):robotFrame(rt.observation)):null;
  const frames=useMemo(()=>currentFrame?[currentFrame]:[],[currentFrame]);
  const cursor=useRef(0);cursor.current=0;
  const config=compatible?rt.world?.config??{}:{};
  const terminal=compatible&&rt.experiment&&!isBusy(rt.experiment);
  const status=!rt.online?'Connection lost':!rt.loaded?'Initializing':rt.mutating?'Applying change':
    rt.session?.status==='stopping'?'Stopping safely':isBusy(rt.experiment)&&rt.liveState?.stage==='executing'?'Live physics execution':
    isBusy(rt.experiment)?rt.experiment?.status==='queued'?'Queued':'Evaluating alternatives':
    rt.experiment?.status==='cancelled'?'Cancelled':rt.experiment?.status==='failed'?'Experiment failed':
    rt.experiment?.result.execution_evaluation&&!(rt.experiment.result.execution_evaluation as {success:boolean}).success?'Execution failed':
    terminal&&rt.experiment?.selected_branch_id?'Task verified':terminal?'No feasible result':'Ready to start';
  const counters=Object.assign({},...rt.events.filter(e=>e.kind==='progress').map(e=>e.details),rt.experiment?.result.search??{}) as Record<string,unknown>;
  const disabled=rt.mutating||!compatible||!rt.online;
  const science=useMemo(()=>backend==='scipy'&&compatible?scienceObservation(rt.observation):null,[backend,compatible,rt.observation]);
  const numericalTime=branches.find(b=>b.id===selected?.id)?.trace.at(-1)?.time??0;
  useEffect(()=>{setBranchId(null);setEditing(false);},[backend,rt.experiment?.id]);
  const choose=async(b:Backend)=>{try{await rt.stop();setBackend(b);setPage('workspace');localStorage.setItem('vivacity:lab',b);}catch(e){setDownloadError(errorMessage(e));}};

  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="site-header"><Brand/><nav className="main-nav" aria-label="Choose laboratory">
      <button aria-pressed={page==='workspace'&&robotics} disabled={rt.mutating} onClick={()=>choose('mujoco')}>Robotics</button>
      <button aria-pressed={page==='workspace'&&!robotics} disabled={rt.mutating} onClick={()=>choose('scipy')}>Discovery</button>
      <button aria-pressed={page==='import'} onClick={async()=>{try{await rt.stop();setPage('import');}catch(e){setDownloadError(errorMessage(e));}}}>Import World</button>
    </nav></header>
    <main id="workspace">
      {page==='import'?<Suspense fallback={<div className="viewport-loading">Loading import tools…</div>}><ImportWorld/></Suspense>:<>
        <div className="workspace-intro"><div>
          {robotics&&<nav className="world-switch" aria-label="Robotics world"><button aria-pressed={!cloth} onClick={()=>choose('mujoco')}>Object Pickup</button><button aria-pressed={cloth} onClick={()=>choose('cloth')}>Cloth Folding</button></nav>}
          <h1>{cloth?'Fold the cloth. Verify the result.':robotics?'Grasp, lift and place the object.':'The Invisible Planet'}</h1>
          <p>{cloth?'An actuated Panda carries a pre-attached folding bar through a physical flex sheet.':robotics?'Contact-driven pickup. Independent alternatives, fresh execution, measured placement.':'Can an unseen gravitational influence explain the observed orbit?'}</p>
        </div><span className="connection" role="status">{rt.online?'Viva Physics connected':'Runtime offline'}</span></div>
        {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={18}/><span>Simulation runtime unavailable.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
        {rt.error&&<div className="error-notice" role="alert"><Warning size={18}/><span>{rt.error}</span><button onClick={rt.reconnect}>Reconnect</button><button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17}/></button></div>}
        <div className="workbench">
          <section className="visual-area" aria-label="Live simulation">
            {cloth?<Suspense fallback={<div className="viewport-loading">Loading cloth…</div>}><ClothView frames={frames as ClothFrame[]} cursor={cursor} time={currentFrame?.time??0} playing={false} config={config}/></Suspense>:
              robotics?<Suspense fallback={<div className="viewport-loading">Loading workcell…</div>}><RobotView frames={frames as RobotFrame[]} cursor={cursor} config={config} replaying={false} playing={false} renderTime={currentFrame?.time??0}/></Suspense>:
                <Suspense fallback={<div className="viewport-loading">Loading discovery…</div>}><ScienceView observation={science} branches={branches} selected={selected?.id??null} time={numericalTime} playing={false}/></Suspense>}
            <div className="experiment-actions">
              <button className="primary run-button" disabled={disabled} onClick={async()=>{try{await(rt.active?rt.stop():rt.run());}catch(e){setDownloadError(errorMessage(e));}}}>{rt.active?'Stop experiments':'Start experiments'}<ArrowRight size={18}/></button>
              <button className="secondary" disabled={disabled} onClick={()=>setEditing(e=>!e)}><SlidersHorizontal size={18}/>{cloth?'Cloth settings':robotics?'Change conditions':'Observation settings'}</button>
              <button className="secondary" disabled={disabled} onClick={rt.reset}><ArrowsClockwise size={18}/>Reset world</button>
            </div>
          </section>
          <aside className="results" aria-label="Verified results">
            <div className="section-heading"><h2>{cloth?'Best verified folds':robotics?'Best verified placements':'Hypotheses'}</h2><span className="status-label" data-testid="experiment-status" aria-live="polite">{status}</span></div>
            {editing&&rt.world?cloth?<ClothSettings key={rt.world.id} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:
              <Settings key={rt.world.id} backend={backend} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:<>
              {!ranked.length?<p className="results-empty">{rt.busy?'Computing and validating independent alternatives…':terminal?'No feasible candidate. Measured failures are retained below.':rt.loaded?'Choose Start experiments when you’re ready. You can change the settings first.':'Initializing an actual physical world…'}</p>:
                ranked.map((b,i)=><ResultCard key={b.id} branch={b} rank={i} selected={b.id===selected?.id} robotics={robotics} choose={()=>setBranchId(b.id)} download={()=>{setDownloadError(null);api.download(b.experiment_id,b.id).catch(e=>setDownloadError(errorMessage(e)));}}/>)}
              {downloadError&&<p role="alert" className="negative">{downloadError}</p>}
              <p className="decision" data-testid="decision">{compatible?String(rt.experiment?.error??rt.experiment?.result.conclusion??''):''}</p>
              {rt.experiment?.stale&&<p className="stale-warning" data-testid="stale-warning">The world changed. These results describe its previous configuration.</p>}
              {!robotics&&selected&&<details className="fit-parameters"><summary>Fitted parameters & uncertainty</summary>{Object.entries(selected.evaluation.parameters??{}).map(([key,value])=><p key={key}>{key.replaceAll('_',' ')}: {format(value,5)} ± {format(selected.evaluation.uncertainty?.standard_errors[key],5)}</p>)}<p className="small">{selected.evaluation.uncertainty?.caveat}</p></details>}
            </>}
          </aside>
        </div>
        {robotics&&counters.generated!==undefined&&<dl className="search-counts" aria-label="Actual search work">{[['Generated','generated'],['Screened','screened'],['Passed screening','screening_passed'],['Validation rollouts','fully_simulated'],['Verified feasible','verified_feasible']].map(([name,key])=><div key={key}><dt>{name}</dt><dd data-testid={`count-${key}`}>{Number(counters[key]??0).toLocaleString()}</dd></div>)}</dl>}
        <TechnicalInspector events={rt.events} initialized={compatible} playing={false} branches={branches} select={setBranchId} history={{ids:rt.session?.experiments??[],open:rt.history,disabled:rt.mutating}}/>
      </>}
    </main>
    <footer><span>Viva Physics</span><details><summary>Credits & scope</summary><p>Robotics: MuJoCo and Menagerie Franka Panda (Apache 2.0), synthetic contact benchmark. Cloth: actuated Panda, MuJoCo flex, pre-attached folding fixture; experimental, no autonomous grasp acquisition. Science: SciPy, planar 2D model testing and synthetic observations. Deterministic policy; no hosted LLM reasoning. Sessions are bounded and stop without a browser lease.</p></details><a href={`${API}/docs`} target="_blank" rel="noreferrer">API reference <ArrowRight size={14}/></a></footer>
  </>;
}
