import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowsClockwise, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { API, api, errorMessage } from './api';
import { format, robotFrame, clothFrame, type Backend, type Branch, type RobotFrame, type ClothFrame, type Vec3 } from './domain';
import { objectHalfSizes, placementAwayFrom } from './pickupWorkspace';
import Settings from './Settings';
import ClothSettings from './ClothSettings';
import TechnicalInspector from './TechnicalInspector';
import ResultCard from './ResultCard';
import Brand from './Brand';
import TemplatePicker, { DEFAULT_SELECTION, DEFAULT_CONFIG, selectionKey, selectionNames, type Selection } from './TemplatePicker';

const RobotView=lazy(()=>import('./RobotView'));
const ClothView=lazy(()=>import('./ClothView'));
const ImportWorld=lazy(()=>import('./ImportWorld'));

export default function App(){
  const [activeTemplate,setActiveTemplate]=useState({selection:DEFAULT_SELECTION,backend:'mujoco' as Backend,config:DEFAULT_CONFIG as Record<string,unknown>});
  const [page,setPage]=useState<'workspace'|'import'>('workspace');
  const backend=activeTemplate.backend,cloth=backend==='cloth';
  const rt=useRuntime(backend,selectionKey(activeTemplate.selection),activeTemplate.config);
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
  const status=!rt.loaded?'Initializing':!rt.online?'Connection lost':rt.mutating?'Applying change':
    rt.session?.status==='stopping'?'Stopping safely':rt.session?.paused?'Simulation paused':
    rt.session?.pause_requested?'Pausing safely':isBusy(rt.experiment)&&rt.liveState?.stage==='testing_candidates'?'Testing real physics':
    isBusy(rt.experiment)&&rt.liveState?.stage==='executing'?'Live physics execution':
    isBusy(rt.experiment)?rt.experiment?.status==='queued'?'Queued':'Evaluating alternatives':
    rt.experiment?.stale?'World changed · run again':
    rt.experiment?.status==='cancelled'?'Cancelled':rt.experiment?.status==='failed'?'Experiment failed':
    rt.experiment?.result.execution_evaluation&&!(rt.experiment.result.execution_evaluation as {success:boolean}).success?'Execution failed':
    terminal&&rt.experiment?.selected_branch_id?'Task verified':terminal?'No feasible result':'Ready to start';
  const counters=Object.assign({},...rt.events.filter(e=>e.kind==='progress').map(e=>e.details),rt.experiment?.result.search??{}) as Record<string,unknown>;
  const disabled=rt.mutating||!compatible||!rt.online;
  const canMoveCube=backend==='mujoco'&&!disabled&&!rt.active&&!isBusy(rt.experiment)&&config.scene_profile!=='orbital_salvage';
  const moveCube=async(point:Vec3)=>rt.apply({...config,cube_position:point,
    placement_position:placementAwayFrom(point,config.placement_position as Vec3,objectHalfSizes(config))});
  useEffect(()=>{setBranchId(null);setEditing(false);},[backend,rt.experiment?.id]);
  const loadTemplate=async(selection:Selection)=>{
    try{await rt.stop();const resolved=await api.resolveTemplate(selection);
      setActiveTemplate({selection,backend:resolved.backend,config:resolved.config as Record<string,unknown>});
      return true;
    }catch(e){setDownloadError(errorMessage(e));return false;}
  };

  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="site-header"><Brand/><nav className="main-nav" aria-label="Workspace navigation">
      <button aria-pressed={page==='workspace'} disabled={rt.mutating} onClick={()=>setPage('workspace')}>Robotics</button>
      <button aria-pressed={page==='import'} onClick={async()=>{try{await rt.stop();setPage('import');}catch(e){setDownloadError(errorMessage(e));}}}>Import World</button>
    </nav></header>
    <main id="workspace">
      {page==='import'?<Suspense fallback={<div className="viewport-loading">Loading import tools…</div>}><ImportWorld/></Suspense>:<>
        <TemplatePicker loaded={activeTemplate.selection} busy={rt.mutating} load={loadTemplate}/>
        <div className="loaded-template"><span>Loaded physical world</span><strong>{selectionNames(activeTemplate.selection)}</strong><span className="connection" role="status">{rt.online?'Viva Physics connected':'Connecting to physics runtime…'}</span></div>
        {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={18}/><span>Simulation runtime unavailable.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
        {rt.error&&<div className="error-notice" role="alert"><Warning size={18}/><span>{rt.error}</span>{!rt.online&&<button onClick={rt.reconnect}>Reconnect</button>}<button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17}/></button></div>}
        <div className="workbench">
          <section className="visual-area" aria-label="Live simulation">
            {cloth?<Suspense fallback={<div className="viewport-loading">Loading cloth…</div>}><ClothView frames={frames as ClothFrame[]} cursor={cursor} time={currentFrame?.time??0} playing={false} config={config}/></Suspense>:
              <Suspense fallback={<div className="viewport-loading">Loading workcell…</div>}><RobotView frames={frames as RobotFrame[]} cursor={cursor} config={config} replaying={false} playing={false} renderTime={currentFrame?.time??0} canMoveCube={canMoveCube} onMoveCube={moveCube}/></Suspense>}
            <div className="experiment-actions">
              <button className="primary run-button" disabled={disabled||rt.active} onClick={rt.run}>Start experiments<ArrowRight size={18}/></button>
              {rt.active&&<button className="secondary" disabled={disabled||rt.session?.status==='stopping'} onClick={rt.togglePause}>{rt.session?.pause_requested?'Resume simulation':'Pause simulation'}</button>}
              {rt.active&&<button className="secondary" disabled={disabled||rt.session?.status==='stopping'} onClick={async()=>{try{await rt.stop();}catch(e){setDownloadError(errorMessage(e));}}}>Stop experiments</button>}
              <button className="secondary" disabled={disabled} onClick={()=>setEditing(e=>!e)}><SlidersHorizontal size={18}/>{cloth?'Cloth settings':'Change conditions'}</button>
              <button className="secondary" disabled={disabled} onClick={rt.reset}><ArrowsClockwise size={18}/>Reset world</button>
            </div>
            {backend==='mujoco'&&<p className="small" role="status">The search tests physical alternatives until measured improvement levels off or this host reaches its compute budget. Progress below counts completed backend simulations.</p>}
          </section>
          <aside className="results" aria-label="Verified results">
            <div className="section-heading"><h2>{cloth?'Best verified folds':'Best verified placements'}</h2><span className="status-label" data-testid="experiment-status" aria-live="polite">{status}</span></div>
            {backend==='mujoco'&&config.task==='pick_place'&&config.scene_profile!=='orbital_salvage'&&<p className="sensor-summary" data-testid="object-perception" role="status">{rt.active?'Object localization pauses during physical execution.':rt.perception?.detected&&rt.perception.estimated_xy_m?`Simulated depth sensing: object at X ${format(rt.perception.estimated_xy_m[0])} m, Y ${format(rt.perception.estimated_xy_m[1])} m from ${rt.perception.visible_cube_rays} MuJoCo rays.`:rt.perception?'Object is not visible to the simulated overhead sensor.':'Locating the object…'} <span>Simulator labels, not a real camera.</span></p>}
            {editing&&rt.world?cloth?<ClothSettings key={rt.world.id} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:
              <Settings key={rt.world.id} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:<>
              {!ranked.length?<p className="results-empty">{rt.busy?'Computing and validating independent alternatives…':terminal&&rt.experiment?.selected_branch_id?'Loading measured results…':terminal?'No feasible candidate. Measured failures are retained below.':rt.loaded?'Choose Start experiments when you’re ready. You can change the settings first.':'Initializing an actual physical world…'}</p>:
                ranked.map((b,i)=><ResultCard key={b.id} branch={b} rank={i} selected={b.id===selected?.id} choose={()=>setBranchId(b.id)} download={()=>{setDownloadError(null);api.download(b.experiment_id,b.id).catch(e=>setDownloadError(errorMessage(e)));}}/>)}
              {downloadError&&<p role="alert" className="negative">{downloadError}</p>}
              <p className="decision" data-testid="decision">{compatible?String(rt.experiment?.error??rt.experiment?.result.conclusion??''):''}</p>
              {rt.experiment?.stale&&<p className="stale-warning" data-testid="stale-warning">The world changed. These results describe its previous configuration.</p>}
            </>}
          </aside>
        </div>
        {counters.generated!==undefined&&<dl className="search-counts" aria-label="Actual search work">{[['Generated','generated'],['Screened','screened'],['Passed screening','screening_passed'],[cloth?'Validation rollouts':'Physics trials','fully_simulated'],['Verified feasible','verified_feasible']].map(([name,key])=><div key={key}><dt>{name}</dt><dd data-testid={`count-${key}`}>{Number(counters[key]??0).toLocaleString()}{!cloth&&!counters.adaptive_stopping&&key==='fully_simulated'&&Number(counters.physics_target)>0?` / ${Number(counters.physics_target).toLocaleString()}`:''}</dd></div>)}</dl>}
        <TechnicalInspector events={rt.events} initialized={compatible} playing={false} branches={branches} select={setBranchId} history={{ids:rt.session?.experiments??[],open:rt.history,disabled:rt.mutating}}/>
      </>}
    </main>
    <footer><span>Viva Physics</span><details><summary>Credits & scope</summary><p>Robotics: MuJoCo and Menagerie Franka Panda (Apache 2.0), simplified physical workcell. Cloth: actuated Panda, MuJoCo flex, pre-attached folding fixture; experimental, no autonomous grasp acquisition. Deterministic policy; no hosted LLM reasoning. Sessions are bounded and stop without a browser lease.</p></details><a href={`${API}/docs`} target="_blank" rel="noreferrer">API reference <ArrowRight size={14}/></a></footer>
  </>;
}
