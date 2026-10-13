import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowsClockwise, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { API, BACKEND, api, errorMessage } from './api';
import { format, robotFrame, clothFrame, type Backend, type Branch, type RobotFrame, type ClothFrame, type Vec3 } from './domain';
import { objectHalfSizes, placementAwayFrom } from './pickupWorkspace';
import Settings from './Settings';
import ClothSettings from './ClothSettings';
import TechnicalInspector from './TechnicalInspector';
import ResultCard from './ResultCard';
import Brand from './Brand';
import TemplatePicker, { DEFAULT_SELECTION, selectionKey, type Selection } from './TemplatePicker';
import ExperimentSetup from './ExperimentSetup';
import {workspaceApi,defaultConfiguration,type Configuration,type SavedConfiguration,type LibraryWorld,type Option} from './workspaceApi';
import './studio.css';
import defaultWorkcell from './generated/defaultWorkcell.json';

const RobotView=lazy(()=>import('./RobotView'));
const ClothView=lazy(()=>import('./ClothView'));
const ImportWorld=lazy(()=>import('./ImportWorld'));
const WorldLibrary=lazy(()=>import('./WorldLibrary'));
const RegistryView=lazy(()=>import('./RegistryView'));
const ExperimentLibrary=lazy(()=>import('./ExperimentLibrary'));

export default function App(){
  const [activeTemplate,setActiveTemplate]=useState<{selection:Selection;backend:Backend;config:Record<string,unknown>;key?:string;name?:string;configurationId?:string}>({selection:DEFAULT_SELECTION,backend:'mujoco',config:defaultWorkcell,key:'curated-warehouse-v1',name:'Franka Panda / Industrial warehouse / Pick and place'});
  const [draft,setDraft]=useState<Configuration>(defaultConfiguration('warehouse'));
  const [page,setPage]=useState<'workspace'|'worlds'|'robots'|'operations'|'experiments'|'settings'|'import'>('workspace');
  const setupSummary=useRef<HTMLElement>(null);
  const [setupOpen,setSetupOpen]=useState(false);
  const [setupStep,setSetupStep]=useState(0);
  const [preparing,setPreparing]=useState(false);
  const [visualWorld,setVisualWorld]=useState<LibraryWorld|undefined>();
  useEffect(()=>{workspaceApi.world('warehouse').then(setVisualWorld).catch(()=>{});},[]);
  const backend=activeTemplate.backend,cloth=backend==='cloth';
  const rt=useRuntime(backend,activeTemplate.key??selectionKey(activeTemplate.selection),activeTemplate.config,activeTemplate.configurationId);
  const [branchId,setBranchId]=useState<string|null>(null),[editing,setEditing]=useState(false),[downloadError,setDownloadError]=useState<string|null>(null);
  const compatible=rt.world?.backend===backend&&(rt.world.config.robot_model??'panda')===(activeTemplate.config.robot_model??'panda'),branches=compatible?rt.branches:[];
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
  const disabled=preparing||rt.mutating||!compatible||!rt.online;
  const canMoveCube=backend==='mujoco'&&!disabled&&!rt.active&&!isBusy(rt.experiment)&&config.scene_profile!=='orbital_salvage';
  const moveCube=async(point:Vec3)=>{
    const sizes=objectHalfSizes(config),destination=placementAwayFrom(point,config.placement_position as Vec3,sizes);
    if(config.physical_operation==='stacking')destination[2]=3*sizes[2]+.001;
    return rt.apply({...config,cube_position:point,placement_position:destination});
  };
  useEffect(()=>{setBranchId(null);setEditing(false);},[backend,rt.experiment?.id]);
  const loadTemplate=async(selection:Selection)=>{
    try{await rt.stop();const resolved=await api.resolveTemplate(selection);
      setVisualWorld(undefined);setActiveTemplate({selection,backend:resolved.backend,config:resolved.config as Record<string,unknown>});
      return true;
    }catch(e){setDownloadError(errorMessage(e));return false;}
  };
  const loadConfiguration=async(saved:SavedConfiguration,world:LibraryWorld)=>{
    await rt.stop();const resolved=await workspaceApi.resolve(saved.configuration);
    setVisualWorld(world);
    setDraft(saved.configuration);setActiveTemplate({selection:DEFAULT_SELECTION,backend:resolved.world.backend,
      config:resolved.world.config as Record<string,unknown>,key:'configuration:'+saved.id,configurationId:saved.id,
      name:`${saved.configuration.robot_id} / ${world.name} / ${saved.configuration.operation_id.replaceAll('_',' ')}`});
    setSetupOpen(false);setPage('workspace');setupSummary.current?.focus();
  };
  const prepare=async(configuration:Configuration,step:number)=>{
    if(preparing)return;setPreparing(true);setDownloadError(null);setPage('workspace');setDraft(configuration);
    try{const [saved,world]=await Promise.all([workspaceApi.save(configuration),workspaceApi.world(configuration.environment_id)]);await loadConfiguration(saved,world);setSetupStep(step);setSetupOpen(true);}
    catch(e){setDownloadError(errorMessage(e));}finally{setPreparing(false);}
  };
  const chooseWorld=(world:LibraryWorld)=>prepare({...draft,environment_id:world.id,...(world.id==='textile_fixture'?{operation_id:'cloth_fold' as const,gripper_id:'fold_fixture' as const,robot_id:'panda' as const}:draft.operation_id==='cloth_fold'?{operation_id:'pick_place' as const,gripper_id:'panda_parallel' as const}:{})},0);
  const chooseOption=(option:Option)=>{
    if(page==='robots')return prepare({...draft,robot_id:option.id as Configuration['robot_id'],gripper_id:'panda_parallel',...(draft.operation_id==='cloth_fold'?{operation_id:'pick_place' as const,environment_id:'warehouse'}:{})},1);
    if(option.id==='cloth_fold')return prepare({...draft,operation_id:'cloth_fold',robot_id:'panda',gripper_id:'fold_fixture',environment_id:'textile_fixture'},2);
    return prepare({...draft,operation_id:option.id as Configuration['operation_id'],gripper_id:'panda_parallel',...(draft.environment_id==='textile_fixture'?{environment_id:'warehouse'}:{})},2);
  };

  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="site-header"><Brand/><nav className="main-nav" aria-label="Workspace navigation">
      {(['workspace','worlds','robots','experiments'] as const).map(id=><button key={id} aria-pressed={page===id} disabled={rt.mutating} onClick={()=>setPage(id)}>{id[0].toUpperCase()+id.slice(1)}</button>)}
      <button aria-pressed={page==='operations'} onClick={()=>setPage('operations')}>Operations</button>
      <button className="nav-settings" aria-label="Runtime settings" onClick={()=>setPage('settings')}><SlidersHorizontal size={18}/></button>
    </nav></header>
    <main id="workspace" tabIndex={-1}>
      {page==='worlds'?<Suspense fallback={<p>Loading world library…</p>}><WorldLibrary choose={chooseWorld} nativeImport={async()=>{await rt.stop();setPage('import');}}/></Suspense>:
       page==='robots'||page==='operations'?<Suspense fallback={<p>Loading registry…</p>}><RegistryView mode={page} choose={chooseOption}/></Suspense>:
       page==='experiments'?<Suspense fallback={<p>Loading measured experiment history…</p>}><ExperimentLibrary load={loadConfiguration}/></Suspense>:
       page==='settings'?<section className="library-area"><h1>Runtime settings</h1><p>API: {API}</p><p className="small">Provider keys stay in backend environment variables. World generation availability is shown in Worlds. This demo uses bounded shared compute and browser capabilities; it does not provide production user accounts or guaranteed uptime.</p><a href={`${BACKEND}/docs`} target="_blank" rel="noreferrer">API and schema reference</a></section>:
       page==='import'?<><button className="secondary" onClick={()=>setPage('worlds')}>Back to world library</button><Suspense fallback={<div className="viewport-loading">Loading import tools…</div>}><ImportWorld/></Suspense></>:<>
        <div className="workspace-heading"><div><h1>Design. Simulate. Discover.</h1><p>Explore robotic systems in physical environments.</p></div><span className="connection" role="status">{rt.online?'Physics connected':'Connecting to runtime…'}</span></div>
        {preparing&&<p role="status" className="small">Loading the selected physical configuration…</p>}
        {rt.recoveryNotice&&<p role="status" className="small">{rt.recoveryNotice}</p>}
        <nav className="journey" aria-label="Experiment stages">{['Environment','Robot','Operation','Experiment'].map((label,i)=><button key={label} aria-pressed={setupOpen&&setupStep===i} disabled={rt.active} onClick={()=>{setSetupStep(i);setSetupOpen(true);setEditing(false);}}><span>0{i+1}</span>{label}</button>)}</nav>
        {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={18}/><span>Simulation runtime unavailable.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
        {downloadError&&<p className="negative" role="alert">{downloadError}</p>}
        {rt.error&&<div className="error-notice" role="alert"><Warning size={18}/><span>{rt.error}</span>{!rt.online&&<button onClick={rt.reconnect}>Reconnect</button>}<button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17}/></button></div>}
        <div className="workbench">
          <section className="visual-area" aria-label="Live simulation">
            {cloth?<Suspense fallback={<div className="viewport-loading">Loading cloth…</div>}><ClothView frames={frames as ClothFrame[]} cursor={cursor} time={currentFrame?.time??0} playing={false} config={config}/></Suspense>:
              <Suspense fallback={<div className="viewport-loading">Loading workcell…</div>}><RobotView frames={frames as RobotFrame[]} cursor={cursor} config={config} replaying={false} playing={false} renderTime={currentFrame?.time??0} canMoveCube={canMoveCube} onMoveCube={moveCube} visualWorld={visualWorld}/></Suspense>}
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
            {setupOpen?<><div className="context-heading"><h2>Configure experiment</h2><button aria-label="Close configuration" className="icon-button" onClick={()=>setSetupOpen(false)}><X size={16}/></button></div><ExperimentSetup initial={draft} load={loadConfiguration} worldsPage={()=>setPage('worlds')} step={setupStep} setStep={setSetupStep}/></>:<>
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
            </>}
          </aside>
        </div>
        {counters.generated!==undefined&&<dl className="search-counts" aria-label="Actual search work">{[['Generated','generated'],['Screened','screened'],['Passed screening','screening_passed'],[cloth?'Validation rollouts':'Physics trials','fully_simulated'],['Verified feasible','verified_feasible']].map(([name,key])=><div key={key}><dt>{name}</dt><dd data-testid={`count-${key}`}>{Number(counters[key]??0).toLocaleString()}{!cloth&&!counters.adaptive_stopping&&key==='fully_simulated'&&Number(counters.physics_target)>0?` / ${Number(counters.physics_target).toLocaleString()}`:''}</dd></div>)}</dl>}
        <TechnicalInspector events={rt.events} initialized={compatible} playing={false} branches={branches} select={setBranchId} history={{ids:rt.session?.experiments??[],open:rt.history,disabled:rt.mutating}}/>
        <details className="quick-templates"><summary>Legacy workcell templates</summary><TemplatePicker loaded={activeTemplate.selection} busy={rt.mutating} load={loadTemplate}/></details>
      </>}
    </main>
    <footer><span>Viva Physics</span><a href={`${BACKEND}/docs`} target="_blank" rel="noreferrer">API reference <ArrowRight size={14}/></a></footer>
  </>;
}
