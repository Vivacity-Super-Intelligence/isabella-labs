import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowRight, ArrowsClockwise, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { API, BACKEND, api, errorMessage } from './api';
import { format, robotFrame, clothFrame, type Backend, type Branch, type RobotFrame, type ClothFrame, type Vec3 } from './domain';
import { objectHalfSizes, placementAwayFrom, pickupSeparationValid } from './pickupWorkspace';
import Settings from './Settings';
import ClothSettings from './ClothSettings';
import TechnicalInspector from './TechnicalInspector';
import ResultCard from './ResultCard';
import IsabellaHome from './IsabellaHome';
import LabOpening from './LabOpening';
import { ISABELLA_OPENING_CONFIG, shouldShowLabOpening } from './openingConfig';
import { DEFAULT_SELECTION, selectionKey, type Selection } from './TemplatePicker';
import ExperimentSetup from './ExperimentSetup';
import VRoboticsPrograms from './VRoboticsPrograms';
import PrecisionAssemblyResult from './PrecisionAssemblyResult';
import {workspaceApi,defaultConfiguration,type Configuration,type SavedConfiguration,type LibraryWorld,type RoboticsProgram} from './workspaceApi';
import './studio.css';
import defaultWorkcell from './generated/defaultWorkcell.json';
import {cleanPresetGeometry} from './workspaceGeometry';
import EngineeringPanel from './EngineeringPanel';
import type {OverlayOptions} from './EngineeringOverlay';
const defaultOverlays:OverlayOptions={forces:true,velocity:true,center:true,trajectory:false,collision:false};
import './engineering.css';
import './labOpening.css';
import MeasuredErrorGraph from './RoboticsDiscovery';
import VivaPanel from './VivaPanel';
import {vivaAgentApi,type VivaAction,type VivaOutcome} from './vivaAgentApi';

const FactoryWorkspace=lazy(()=>import('./FactoryWorkspace'));
const LabIndex=lazy(()=>import('./LabIndex'));
const ScienceLab=lazy(()=>import('./ScienceLab'));
const RobotView=lazy(()=>import('./RobotView'));
const ClothView=lazy(()=>import('./ClothView'));
const ImportWorld=lazy(()=>import('./ImportWorld'));
const WorldLibrary=lazy(()=>import('./WorldLibrary'));
const ExperimentLibrary=lazy(()=>import('./ExperimentLibrary'));
const HumanoidLab=lazy(()=>import('./HumanoidLab'));
const PhysicalWorldEditor=lazy(()=>import('./PhysicalWorldEditor'));

export default function App(){
  const [showOpening,setShowOpening]=useState(()=>shouldShowLabOpening(ISABELLA_OPENING_CONFIG,import.meta.env.DEV));
  const finishOpening=useCallback(()=>{document.querySelector<HTMLElement>(ISABELLA_OPENING_CONFIG.homeRootSelector)?.removeAttribute('inert');document.getElementById(ISABELLA_OPENING_CONFIG.homeFocusTarget)?.focus({preventScroll:true});setShowOpening(false);},[]);
  const [guidedAutostart,setGuidedAutostart]=useState(()=>new URLSearchParams(window.location.search).get('guided')==='1');
  const [activeTemplate,setActiveTemplate]=useState<{selection:Selection;backend:Backend;config:Record<string,unknown>;key?:string;name?:string;configurationId?:string}>({selection:DEFAULT_SELECTION,backend:'mujoco',config:defaultWorkcell,key:'curated-warehouse-v3-clear',name:'Franka Panda / Industrial warehouse / Pick and place'});
  const [draft,setDraft]=useState<Configuration>(defaultConfiguration('warehouse'));
  type Page='home'|'laboratory'|'discovery'|'factory'|'workspace'|'worlds'|'experiments'|'results'|'settings'|'import';
  const routePage=(path:string):Page=>path==='/laboratory'?'laboratory':path==='/discovery'?'discovery':path==='/lab'?'factory':path==='/workspace'||path==='/works'?'workspace':path==='/worlds'?'worlds':path==='/experiments'?'experiments':path==='/settings'?'settings':path==='/import'?'import':'home';
  const [page,setPage]=useState<Page>(()=>routePage(window.location.pathname));
  const navigate=useCallback((next:Page,path:string,guided=false)=>{window.history.pushState({},'',path);setGuidedAutostart(guided);setPage(next);window.scrollTo(0,0);},[]);
  const navigateFromLink=(event:MouseEvent<HTMLAnchorElement>,next:Page,path:string)=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(!rt.mutating)navigate(next,path);
  };
  useEffect(()=>{const back=()=>{setPage(routePage(window.location.pathname));setGuidedAutostart(new URLSearchParams(window.location.search).get('guided')==='1');if(window.location.pathname==='/works')setRobotCategory('humanoids');else if(window.location.pathname==='/workspace'){setRobotCategory('robotic_arms');setSelectedHumanoid(null);}};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
  const [inspecting,setInspecting]=useState(false),[inspectSelection,setInspectSelection]=useState<'object'|'robot'|'experiment'>('object');
  const [overlays,setOverlays]=useState<OverlayOptions>(defaultOverlays);
  const setupSummary=useRef<HTMLElement>(null);
  const [setupOpen,setSetupOpen]=useState(false);
  const [setupStep,setSetupStep]=useState(0);
  const [preparing,setPreparing]=useState(false);
  const [visualWorld,setVisualWorld]=useState<LibraryWorld|undefined>();
  const [robotCategory,setRobotCategory]=useState<RoboticsProgram['category']>(()=>window.location.pathname==='/works'?'humanoids':'robotic_arms');
  const [selectedHumanoid,setSelectedHumanoid]=useState<RoboticsProgram|null>(null);
  useEffect(()=>{
    if(page!=='workspace'||visualWorld)return;
    let active=true;
    workspaceApi.world(draft.environment_id).then(world=>{if(active)setVisualWorld(world);}).catch(()=>{});
    return()=>{active=false;};
  },[page,draft.environment_id,visualWorld]);
  const backend=activeTemplate.backend,cloth=backend==='cloth';
  const rt=useRuntime(backend,activeTemplate.key??selectionKey(activeTemplate.selection),activeTemplate.config,activeTemplate.configurationId,page!=='factory'&&page!=='home'&&page!=='laboratory'&&page!=='discovery'&&robotCategory!=='humanoids'&&!selectedHumanoid);
  const [branchId,setBranchId]=useState<string|null>(null),[editing,setEditing]=useState(false),[downloadError,setDownloadError]=useState<string|null>(null);
  const [editorSelection,setEditorSelection]=useState('object');
  const compatible=rt.world?.backend===backend&&(rt.world.config.robot_model??'panda')===(activeTemplate.config.robot_model??'panda'),branches=compatible?rt.branches:[];
  const ranked=useMemo(()=>{
    const ids=rt.experiment?.result.top_feasible_branch_ids as string[]|undefined;
    if(ids)return ids.map(id=>branches.find(b=>b.id===id)).filter((b):b is Branch=>!!b&&b.evaluation.success).slice(0,3);
    return branches.filter(b=>b.evaluation.success&&b.action.execution_role!=='authoritative_execution')
      .sort((a,b)=>Number(b.id===rt.experiment?.selected_branch_id)-Number(a.id===rt.experiment?.selected_branch_id)).slice(0,3);
  },[branches,rt.experiment]);
  const selected=branches.find(b=>b.id===branchId)??ranked[0]??(rt.experiment&&!isBusy(rt.experiment)?branches.find(b=>!b.evaluation.success):undefined);
  const [replay,setReplay]=useState<{branchId:string;frames:RobotFrame[];playing:boolean}|null>(null);
  const [replayPosition,setReplayPosition]=useState(0);
  const [replayLoading,setReplayLoading]=useState(false);
  const [replayError,setReplayError]=useState<string|null>(null);
  const cursor=useRef(0);
  const replayDuration=replay?Math.max(0,replay.frames.at(-1)!.time-replay.frames[0].time):0;
  useEffect(()=>{setReplay(null);setReplayPosition(0);setReplayError(null);cursor.current=0;},[rt.experiment?.id,rt.experiment?.stale]);
  useEffect(()=>{
    if(!replay?.playing)return;
    let raf=0,lastDisplay=0;
    const origin=performance.now(),offset=cursor.current;
    const tick=(now:number)=>{
      const next=Math.min(replayDuration,offset+(now-origin)/1000*4);
      cursor.current=next;
      if(now-lastDisplay>=100||next>=replayDuration){setReplayPosition(next);lastDisplay=now;}
      if(next>=replayDuration){setReplay(current=>current?{...current,playing:false}:null);return;}
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[replay?.playing,replay?.branchId,replayDuration]);
  const openReplay=async():Promise<boolean>=>{
    if(!rt.experiment||!selected)return false;
    setReplayLoading(true);setReplayError(null);
    try{
      const saved=await api.replay(rt.experiment.id);
      const branch=saved.branches.find(item=>item.branch_id===selected.id);
      const measured=branch?.frames.map(frame=>robotFrame(frame)).filter((frame):frame is RobotFrame=>frame!==null)??[];
      if(measured.length<2)throw new Error('The selected branch has no replayable physics trace.');
      cursor.current=0;setReplayPosition(0);setReplay({branchId:selected.id,frames:measured,playing:true});
      return true;
    }catch(error){setReplayError(errorMessage(error));return false;}finally{setReplayLoading(false);}
  };
  const liveFrame=compatible?(cloth?clothFrame(rt.observation):robotFrame(rt.observation)):null;
  const replayFrame=replay?.frames.find(frame=>frame.time>=replay.frames[0].time+replayPosition)??replay?.frames.at(-1);
  const currentFrame=replayFrame??liveFrame;
  const frames=useMemo(()=>replay?.frames??(liveFrame?[liveFrame]:[]),[replay?.frames,liveFrame]);
  const config=compatible?rt.world?.config??{}:{};
  const editorSupported=backend==='mujoco'&&config.task==='pick_place'&&config.scene_profile==='workcell';
  const terminal=compatible&&rt.experiment&&!isBusy(rt.experiment);
  const status=replay?(replay.playing?'Replaying measured trajectory':'Replay paused'):!rt.loaded?'Initializing':!rt.online?'Connection lost':rt.mutating?'Applying change':
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
  const canMoveCube=backend==='mujoco'&&!replay&&!disabled&&!rt.active&&!isBusy(rt.experiment)&&config.scene_profile!=='orbital_salvage';
  const moveCube=async(point:Vec3)=>{
    const sizes=objectHalfSizes(config),destination=placementAwayFrom(point,config.placement_position as Vec3,sizes);
    if(config.physical_operation==='stacking')destination[2]=3*sizes[2]+.001;
    return rt.apply({...config,cube_position:point,placement_position:destination});
  };
  const moveDestination=async(point:Vec3)=>{
    const pickup=config.cube_position as Vec3;
    if(!pickupSeparationValid(pickup,point))return false;
    return rt.apply({...config,placement_position:point});
  };
  useEffect(()=>{setBranchId(null);setEditing(false);},[backend,rt.experiment?.id]);
  const loadConfiguration=async(saved:SavedConfiguration,world:LibraryWorld)=>{
    await rt.stop();const resolved=await workspaceApi.resolve(saved.configuration);
    setSelectedHumanoid(null);setRobotCategory('robotic_arms');
    setVisualWorld(world);
    setDraft(saved.configuration);setActiveTemplate({selection:DEFAULT_SELECTION,backend:resolved.world.backend,
      config:cleanPresetGeometry(resolved.world.config as Record<string,unknown>),key:'configuration-clear:'+saved.id,configurationId:saved.id,
      name:`${saved.configuration.robot_id} / ${world.name} / ${saved.configuration.operation_id.replaceAll('_',' ')}`});
    setInspecting(false);setSetupOpen(false);if(window.location.pathname!=='/workspace')navigate('workspace','/workspace');else setPage('workspace');setupSummary.current?.focus();
  };
  const prepare=async(configuration:Configuration,step:number)=>{
    if(preparing)return false;setPreparing(true);setDownloadError(null);setInspecting(false);if(window.location.pathname!=='/workspace')navigate('workspace','/workspace');else setPage('workspace');setDraft(configuration);
    try{const [saved,world]=await Promise.all([workspaceApi.save(configuration),workspaceApi.world(configuration.environment_id)]);await loadConfiguration(saved,world);setSetupStep(step);setSetupOpen(true);return true;}
    catch(e){setDownloadError(errorMessage(e));return false;}finally{setPreparing(false);}
  };
  const chooseWorld=(world:LibraryWorld)=>prepare({...draft,environment_id:world.id,...(world.id==='textile_fixture'?{operation_id:'cloth_fold' as const,gripper_id:'fold_fixture' as const,robot_id:'panda' as const}:draft.operation_id==='cloth_fold'?{operation_id:'pick_place' as const,gripper_id:'panda_parallel' as const}:{})},0);

  // The voice panel uses the same configuration and runtime operations as the
  // visible controls. Refs let an ordered request observe each completed render.
  const vivaConfig=useRef(draft);vivaConfig.current=draft;
  const vivaRuntime=useRef(rt);vivaRuntime.current=rt;
  const vivaTemplate=useRef(activeTemplate);vivaTemplate.current=activeTemplate;
  const vivaSelected=useRef(selected);vivaSelected.current=selected;
  const vivaReplay=useRef(openReplay);vivaReplay.current=openReplay;
  const vivaExperiment=useRef(rt.experiment);vivaExperiment.current=rt.experiment;
  const vivaDraftRobot=useRef(false);
  const vivaStartedExperiment=useRef<string|null>(null);
  const vivaUndoStack=useRef<Array<{before:Configuration;after:Configuration;worldId:string;revision:number}>>([]);
  const [vivaUndoCount,setVivaUndoCount]=useState(0);
  const waitForVivaWorld=async(desired:Record<string,unknown>,timeout=30000)=>{
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      const current=vivaRuntime.current,actual=current.world?.config;
      if(current.loaded&&current.online&&actual&&
        actual.robot_model===desired.robot_model&&actual.physical_operation===desired.physical_operation&&
        actual.cube_mass===desired.cube_mass&&actual.cube_friction===desired.cube_friction&&
        JSON.stringify(actual.cube_position)===JSON.stringify(desired.cube_position)&&
        JSON.stringify(actual.placement_position)===JSON.stringify(desired.placement_position)&&
        JSON.stringify(actual.environment)===JSON.stringify(desired.environment))return current.world!;
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw new Error('The selected physical world did not become ready within 30 seconds.');
  };
  const configureViva=async(next:Configuration,recordUndo=true):Promise<VivaOutcome>=>{
    const previous=vivaConfig.current;
    const resolved=await workspaceApi.resolve(next); // Server validates robot, gripper, task, limits and world.
    vivaConfig.current=next;
    if(!await prepare(next,3)){
      vivaConfig.current=previous;setDraft(previous);
      throw new Error('The workspace could not load this validated configuration.');
    }
    setSetupOpen(false);
    const loaded=await waitForVivaWorld(resolved.world.config as Record<string,unknown>);
    vivaStartedExperiment.current=null;
    if(recordUndo&&JSON.stringify(previous)!==JSON.stringify(next)){
      vivaUndoStack.current.push({before:previous,after:next,worldId:loaded.id,revision:loaded.revision});
      if(vivaUndoStack.current.length>10)vivaUndoStack.current.shift();
      setVivaUndoCount(vivaUndoStack.current.length);
    }
    return {success:true,world_id:loaded.id,world_revision:loaded.revision,
      message:`Loaded ${next.robot_id.toUpperCase()} with ${next.operation_id.replaceAll('_',' ')} in ${next.environment_id.replaceAll('_',' ')}.`};
  };
  const waitForVivaExperiment=async(identifier:string,requireTerminal=false,timeout=240000)=>{
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      const current=vivaRuntime.current.experiment;
      if(current?.id===identifier&&(!requireTerminal||(!isBusy(current)&&vivaSelected.current?.experiment_id===identifier)))return current;
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    throw new Error(requireTerminal?'The recorded experiment did not finish with a replayable branch in time.':'The new experiment did not appear in the runtime in time.');
  };
  const executeViva=async(action:VivaAction):Promise<VivaOutcome>=>{
    const args=action.arguments??{},base=vivaConfig.current;
    if(action.kind==='undo'){
      const last=vivaUndoStack.current.at(-1),current=vivaRuntime.current.world;
      if(!last||!current)throw new Error('There is no Viva world edit to undo.');
      if(current.id!==last.worldId||current.revision!==last.revision||JSON.stringify(base)!==JSON.stringify(last.after))
        throw new Error('The world changed after that Viva edit. Review the current configuration before undoing.');
      const restored=await configureViva(last.before,false);
      vivaUndoStack.current.pop();
      const previous=vivaUndoStack.current.at(-1);
      if(previous&&restored.world_id&&restored.world_revision!=null){previous.worldId=restored.world_id;previous.revision=restored.world_revision;}
      setVivaUndoCount(vivaUndoStack.current.length);
      return {...restored,message:`Restored the previous physical world. Object mass is ${last.before.object_mass_kg} kg.`};
    }
    if(action.kind==='select_robot'){vivaDraftRobot.current=false;return configureViva({...base,robot_id:String(args.robot_id) as Configuration['robot_id'],gripper_id:'panda_parallel',...(base.operation_id==='cloth_fold'?{operation_id:'pick_place' as const}:{})});}
    if(action.kind==='select_world')return configureViva({...base,environment_id:String(args.environment_id),...(base.operation_id==='cloth_fold'?{operation_id:'pick_place' as const,gripper_id:'panda_parallel' as const}:{})});
    if(action.kind==='select_operation')return configureViva({...base,operation_id:String(args.operation_id) as Configuration['operation_id']});
    if(action.kind==='set_mass'){
      const mass=typeof args.value_kg==='number'?args.value_kg:base.object_mass_kg*Number(args.multiplier);
      if(!Number.isFinite(mass))throw new Error('Object mass must be a finite number.');
      const limit=base.operation_id==='assembly'?.30:.15;
      if(mass<.02||mass>limit)throw new Error(`Object mass for this task must be between 0.02 and ${limit} kg. The world was not changed.`);
      const result=await configureViva({...base,object_mass_kg:Number(mass.toFixed(5))});
      return {...result,message:`Object mass is ${Number(mass.toFixed(5))} kg in the new physical world.`};
    }
    if(action.kind==='set_friction'){
      const value=Number(args.value);if(!Number.isFinite(value))throw new Error('Friction must be a finite number.');
      const result=await configureViva({...base,object_friction:value});
      return {...result,message:`Sliding friction is ${value} in the new physical world.`};
    }
    if(action.kind==='set_object_position'||action.kind==='set_destination'){
      const xy=args.xy_m;if(!Array.isArray(xy)||xy.length!==2||!xy.every(v=>typeof v==='number'&&Number.isFinite(v)))throw new Error('Give X and Y in metres.');
      const key=action.kind==='set_object_position'?'target_position':'destination_position';
      const result=await configureViva({...base,[key]:[xy[0],xy[1],base.object_half_sizes[2]+.001]});
      return {...result,message:`${key==='target_position'?'Pickup object':'Destination'} set to X ${xy[0]} m, Y ${xy[1]} m.`};
    }
    if(action.kind==='set_quality'){
      localStorage.setItem('vivacity:render-quality','high');window.dispatchEvent(new Event('vivacity:render-quality'));
      return {success:true,message:'View quality set to high fidelity. Physics settings are unchanged.'};
    }
    if(action.kind==='run_experiment'){
      if(vivaDraftRobot.current)throw new Error('The custom six-axis design is a non-executable draft. Select a validated robot such as UR5e to run physics.');
      setSetupOpen(false);
      await waitForVivaWorld(vivaTemplate.current.config);
      const prior=vivaExperiment.current?.id;
      if(!await vivaRuntime.current.run())throw new Error('The runtime refused to start the experiment. Inspect its error message.');
      const deadline=Date.now()+30000;let started=vivaExperiment.current;
      while((!started||started.id===prior)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,150));started=vivaExperiment.current;}
      if(!started||started.id===prior)throw new Error('The runtime did not provide a new experiment ID. Inspect its status before retrying.');
      vivaStartedExperiment.current=started.id;
      const activeWorld=vivaRuntime.current.world;
      if(!activeWorld||activeWorld.id!==started.world_id)throw new Error('The new experiment world was not ready. Inspect its status before retrying.');
      return {success:true,world_id:activeWorld.id,world_revision:activeWorld.revision,experiment_id:started.id,
        message:'Real MuJoCo experiment started. Watch live execution and measured results in the workspace.'};
    }
    if(action.kind==='pause'||action.kind==='resume'){
      const current=vivaRuntime.current;
      if(!current.active||Boolean(current.session?.pause_requested)!==(action.kind==='resume'))throw new Error('No matching active simulation can be paused or resumed.');
      if(!await current.togglePause())throw new Error('The runtime could not change the simulation state.');
      return {success:true,message:action.kind==='pause'?'Pause requested at the next simulator checkpoint.':'Simulation resumed from its preserved state.'};
    }
    if(action.kind==='compare'){navigate('experiments','/experiments');return {success:true,message:'Opened experiment records. Select two recorded outcomes to compare their measurements.'};}
    if(action.kind==='replay'){
      const target=vivaExperiment.current?.id??vivaStartedExperiment.current;
      if(!target)throw new Error('A recorded experiment is required for replay.');
      await waitForVivaExperiment(target,true);
      if(!await vivaReplay.current())throw new Error('The selected measured trajectory could not be replayed.');
      return {success:true,message:'Replaying the selected measured trajectory.'};
    }
    if(action.kind==='export'){
      const target=vivaExperiment.current?.id??vivaStartedExperiment.current;
      if(target)await waitForVivaExperiment(target,true);
      const item=vivaSelected.current;if(!item)throw new Error('Select a completed branch before exporting.');
      await api.download(item.experiment_id,item.id);return {success:true,message:'Downloaded the selected measured branch as JSON.'};
    }
    if(action.kind==='generate_environment'){
      const job=await workspaceApi.generate(String(args.prompt),'openai',String(args._idempotency_key??crypto.randomUUID()));
      navigate('worlds','/worlds');return {success:true,message:`World generation ${job.status}. Job ${job.id}; inspect it in Worlds.`};
    }
    if(action.kind==='import_folder'){
      if(typeof args.staged_import_id!=='string')throw new Error('Choose a local asset file first.');
      navigate('import','/import');return {success:true,message:'Asset staged for import. Review and map its geometry in the Import page.'};
    }
    if(action.kind==='create_robot'){
      const design=await vivaAgentApi.createRobotDesign(String(args.description),undefined,String(args._idempotency_key??crypto.randomUUID()));vivaDraftRobot.current=true;
      return {success:true,design_id:design.id,message:`Created a six-axis design draft. MuJoCo compiled it and measured ${design.measured_joint_displacement_rad.toFixed(3)} rad of controlled joint motion. Task planning and sorting are not validated for this draft.`};
    }
    throw new Error('Unsupported workspace action.');
  };


  return <>{page==='home'?<IsabellaHome deferScene={showOpening} enterLab={()=>navigate('laboratory','/laboratory')} openScience={()=>navigate('discovery','/discovery')} openRobotics={()=>navigate('factory','/lab')} openWorlds={()=>navigate('worlds','/worlds')}/>:<>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="site-header platform-nav">
      <a className="isabella-lab-brand" href="/" aria-label="Vivacity home">VIVACITY</a>
      <nav className="main-nav" aria-label="Workspace navigation">
        <a href="/laboratory" aria-current={['laboratory','factory','discovery'].includes(page)?'page':undefined} aria-disabled={rt.mutating} onClick={event=>navigateFromLink(event,'laboratory','/laboratory')}>Lab</a>
        <a href="/worlds" aria-current={['worlds','workspace','import'].includes(page)?'page':undefined} aria-disabled={rt.mutating} onClick={event=>navigateFromLink(event,'worlds','/worlds')}>Worlds</a>
        <a href="/experiments" aria-current={['experiments','results'].includes(page)?'page':undefined} aria-disabled={rt.mutating} onClick={event=>navigateFromLink(event,'experiments','/experiments')}>Records</a>
      </nav>
      <a className="nav-settings" href="/settings" aria-label="Runtime settings" aria-current={page==='settings'?'page':undefined} aria-disabled={rt.mutating} onClick={event=>navigateFromLink(event,'settings','/settings')}><SlidersHorizontal size={18}/></a>
    </header>
    <main className="platform-main" id="workspace" tabIndex={-1}>
      {page==='laboratory'?<Suspense fallback={<p role="status">Opening the laboratory…</p>}><LabIndex openScience={()=>navigate('discovery','/discovery')} openRobotics={()=>navigate('workspace','/workspace')} openWorlds={()=>navigate('worlds','/worlds')}/></Suspense>:
       page==='discovery'?<Suspense fallback={<p role="status">Preparing numerical laboratory…</p>}><ScienceLab/></Suspense>:
       page==='factory'?<Suspense fallback={<p role="status" className="lab-entry-status">Preparing the physical world…</p>}><FactoryWorkspace startGuided={guidedAutostart}/></Suspense>:
       page==='worlds'?<Suspense fallback={<p>Loading world library…</p>}><WorldLibrary choose={chooseWorld} nativeImport={async()=>{await rt.stop();navigate('import','/import');}}/></Suspense>:
       page==='experiments'||page==='results'?<Suspense fallback={<p>Loading measured experiment history…</p>}><ExperimentLibrary load={loadConfiguration} current={compatible?rt.experiment:null} currentConfig={(branches[0]?.initial_state.config as Record<string,unknown>|undefined)??config} currentFriction={robotFrame(branches[0]?.trace.at(-1))?.inspection?.object.friction[0]}/></Suspense>:
       page==='settings'?<section className="library-area"><h1>Runtime settings</h1><p>API: {API}</p><p className="small">Provider keys stay in backend environment variables. Robotics world generation availability is shown in Worlds. Discovery runs bounded SciPy computations. This demo uses shared compute and browser capabilities; it does not provide production user accounts or guaranteed uptime.</p><a href={`${BACKEND}/docs`} target="_blank" rel="noreferrer">API and schema reference</a></section>:
       page==='import'?<><button className="secondary" onClick={()=>navigate('worlds','/worlds')}>Back to world library</button><Suspense fallback={<div className="viewport-loading">Loading import tools…</div>}><ImportWorld/></Suspense></>:<>
        <div className="workspace-heading"><div><h1>Physical experiments</h1><p>Configure a task. Test alternatives. Inspect measured results.</p></div><span className="connection" role="status">{robotCategory==='humanoids'?'Humanoid physics lab':rt.online?'Physics connected':'Connecting to runtime…'}</span></div>
        <VRoboticsPrograms busy={preparing||rt.active||rt.mutating} category={robotCategory} setCategory={category=>{setRobotCategory(category);if(category==='humanoids'&&window.location.pathname!=='/works')navigate('workspace','/works');if(category==='robotic_arms'&&window.location.pathname==='/works')navigate('workspace','/workspace');}} onInspect={setSelectedHumanoid} onArms={()=>setSelectedHumanoid(null)} onOpen={configuration=>prepare(configuration,3)}/>
        {robotCategory==='humanoids'?(selectedHumanoid?<Suspense fallback={<p role="status">Loading full-body physical model…</p>}><HumanoidLab key={selectedHumanoid.id} program={selectedHumanoid} back={()=>{setSelectedHumanoid(null);setRobotCategory('robotic_arms');if(window.location.pathname==='/works')navigate('workspace','/workspace');}}/></Suspense>:<p role="status">Loading the humanoid programs and physical model…</p>):<>
        {preparing&&<p role="status" className="small">Loading the selected physical configuration…</p>}
        {rt.recoveryNotice&&<p role="status" className="small">{rt.recoveryNotice}</p>}
        <nav className="journey" aria-label="Experiment stages">{['Environment','Robot','Operation','Experiment'].map((label,i)=><button key={label} aria-pressed={setupOpen&&setupStep===i} disabled={rt.active} onClick={()=>{setInspecting(false);setSetupStep(i);setSetupOpen(true);setEditing(false);}}><span>0{i+1}</span>{label}</button>)}</nav>
        {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={18}/><span>Simulation runtime unavailable.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
        {downloadError&&<p className="negative" role="alert">{downloadError}</p>}
        {rt.error&&<div className="error-notice" role="alert"><Warning size={18}/><span>{rt.error}</span>{!rt.online&&<button onClick={rt.reconnect}>Reconnect</button>}<button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17}/></button></div>}
        <div className="workbench">
          <section className="visual-area" aria-label="Live simulation">
            {cloth?<Suspense fallback={<div className="viewport-loading">Loading cloth…</div>}><ClothView frames={frames as ClothFrame[]} cursor={cursor} time={currentFrame?.time??0} playing={false} config={config}/></Suspense>:
              <Suspense fallback={<div className="viewport-loading">Loading workcell…</div>}><RobotView frames={frames as RobotFrame[]} cursor={cursor} config={config} replaying={Boolean(replay)} playing={Boolean(replay?.playing)} renderTime={currentFrame?.time??0} canMoveCube={canMoveCube} onMoveCube={moveCube} onMoveDestination={moveDestination} visualWorld={visualWorld} overlays={inspecting?overlays:undefined} trace={rt.experiment?.stale?[]:(selected?.trace??[]).filter((f):f is RobotFrame=>!!robotFrame(f))} onSelect={s=>{if(editorSupported){setEditorSelection(s);setEditing(true);setInspecting(false);}else{setInspectSelection(s==='robot'?'robot':'object');setInspecting(true);}setSetupOpen(false);}}/></Suspense>}
            <div className="simulation-strip"><div><span>Simulation time</span><strong>{format(replay?replay.frames[0].time+replayPosition:currentFrame?.time??0)} s</strong><small>{status}</small></div>{!cloth&&<button className="secondary" aria-pressed={inspecting} onClick={()=>{setInspecting(v=>!v);setSetupOpen(false);}}>Engineering inspection</button>}</div>
            {inspecting&&!cloth&&<details className="overlay-controls"><summary>Inspection overlays & legend</summary><div>{Object.entries(overlays).map(([id,on])=><label key={id}><input type="checkbox" checked={on} onChange={e=>setOverlays(o=>({...o,[id]:e.target.checked}))}/>{({forces:'Contact / applied forces',velocity:'Linear / angular velocity',center:'Center of mass',trajectory:'Recorded object trajectory',collision:'Robot collision geometry'} as Record<string,string>)[id]}</label>)}</div><p className="small">Amber: contact forces. Coral: applied force. Purple: torque. Teal: velocity / path. Blue: angular velocity. Vector lengths are scaled and capped for visibility. Trajectories use recorded samples from this experiment; this is not a video.</p></details>}
            <div className="experiment-actions">
              <button className="primary run-button" disabled={disabled||rt.active} onClick={()=>{setSetupOpen(false);void rt.run();}}>Start experiments<ArrowRight size={18}/></button>
              {rt.active&&<button className="secondary" disabled={disabled||rt.session?.status==='stopping'} onClick={rt.togglePause}>{rt.session?.pause_requested?'Resume simulation':'Pause simulation'}</button>}
              {rt.active&&<button className="secondary" disabled={disabled||rt.session?.status==='stopping'} onClick={async()=>{try{await rt.stop();}catch(e){setDownloadError(errorMessage(e));}}}>Stop experiments</button>}
              <button className="secondary" disabled={disabled} onClick={()=>{setInspecting(false);setSetupOpen(false);setEditing(e=>!e);}}><SlidersHorizontal size={18}/>{cloth?'Cloth settings':editorSupported?'Edit physical world':'Change conditions'}</button>
              <button className="secondary" disabled={disabled} onClick={rt.reset}><ArrowsClockwise size={18}/>Reset world</button>
            </div>
            {backend==='mujoco'&&terminal&&!rt.active&&!rt.experiment?.stale&&selected&&<div className="workspace-replay">
              {!replay?<button className="secondary" disabled={replayLoading} onClick={()=>void openReplay()}>{replayLoading?'Loading measured trace…':'Replay selected trajectory'}</button>:<>
                <button className="secondary" onClick={()=>setReplay(current=>current?{...current,playing:!current.playing}:null)}>{replay.playing?'Pause replay':'Resume replay'}</button>
                <label>Recorded physics time <input type="range" aria-label="Replay time" min="0" max={replayDuration} step="any" value={replayPosition} onChange={event=>{const next=Number(event.target.value);cursor.current=next;setReplayPosition(next);}}/></label>
                <span>{format(replayPosition,1)} / {format(replayDuration,1)} s · 4× playback</span>
                <button className="secondary" onClick={()=>setReplay(null)}>Exit replay</button>
              </>}
            </div>}
            {replayError&&<p className="negative" role="alert">{replayError}</p>}
            {backend==='mujoco'&&<p className="small" role="status">The search tests physical alternatives until measured improvement levels off or this host reaches its compute budget. Progress below counts completed backend simulations.</p>}
          </section>
          <aside className={`results ${editing||setupOpen||inspecting?'results-editing':''}`} aria-label="Verified results">
            <div className="ranked-results">
            {inspecting&&!cloth?<EngineeringPanel frame={robotFrame(currentFrame)} selection={inspectSelection} select={setInspectSelection}/>:setupOpen?<><div className="context-heading"><h2>Configure experiment</h2><button aria-label="Close configuration" className="icon-button" onClick={()=>setSetupOpen(false)}><X size={16}/></button></div><ExperimentSetup initial={draft} load={loadConfiguration} worldsPage={()=>navigate('worlds','/worlds')} step={setupStep} setStep={setSetupStep}/></>:<>
            <div className="section-heading"><h2>{cloth?'Best verified folds':'Best verified placements'}</h2><span className="status-label" data-testid="experiment-status" aria-live="polite">{status}</span></div>
            {backend==='mujoco'&&config.task==='pick_place'&&config.scene_profile!=='orbital_salvage'&&<details className="sensor-details"><summary>Simulator object localization</summary><p className="sensor-summary" data-testid="object-perception" role="status">{rt.active?'Object localization pauses during physical execution.':rt.perception?.detected&&rt.perception.estimated_xy_m?`Simulated depth sensing: object at X ${format(rt.perception.estimated_xy_m[0])} m, Y ${format(rt.perception.estimated_xy_m[1])} m from ${rt.perception.visible_cube_rays} simulated depth rays.`:rt.perception?'Object is not visible to the simulated overhead sensor.':'Locating the object…'} <span>Simulator labels, not a real camera.</span></p></details>}
            {editing&&rt.world?cloth?<ClothSettings key={rt.world.id} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:
              editorSupported?<Suspense fallback={<p role="status">Loading world editor…</p>}><PhysicalWorldEditor key={rt.world.id} world={rt.world} selected={editorSelection} select={setEditorSelection} disabled={disabled||Boolean(replay)} editProperty={rt.editProperty} editGeometry={rt.editGeometry} restoreVersion={rt.restoreVersion} apply={rt.apply} close={()=>setEditing(false)}/></Suspense>:
              <Settings key={rt.world.id} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:<>
              {!ranked.length?<p className="results-empty">{rt.busy?'Computing and validating independent alternatives…':terminal&&rt.experiment?.selected_branch_id?'Loading measured results…':terminal?'No feasible candidate. Measured failures are retained below.':rt.loaded?'Choose Start experiments when you’re ready. You can change the settings first.':'Initializing an actual physical world…'}</p>:
                ranked.map((b,i)=><ResultCard key={b.id} branch={b} rank={i} selected={b.id===selected?.id} choose={()=>setBranchId(b.id)} download={()=>{setDownloadError(null);api.download(b.experiment_id,b.id).catch(e=>setDownloadError(errorMessage(e)));}}/>)}
              {downloadError&&<p role="alert" className="negative">{downloadError}</p>}
              <p className="decision" data-testid="decision">{compatible?String(rt.experiment?.error??rt.experiment?.result.conclusion??''):''}</p>
              {config.program_id==='precision_assembly'&&terminal&&rt.experiment&&<PrecisionAssemblyResult experimentId={rt.experiment.id} stale={Boolean(rt.experiment.stale)}/>}
            {rt.experiment?.stale&&<p className="stale-warning" data-testid="stale-warning">The world changed. These results describe its previous configuration.</p>}
            </>}
            </>}
            </div>
          </aside>
          <aside className="workspace-analysis" aria-label="Measurements and execution log">
            <MeasuredErrorGraph branch={selected} trace={selected?.trace.filter((frame):frame is RobotFrame=>!!robotFrame(frame))??[]}/>
            <TechnicalInspector events={rt.events} initialized={compatible} running={rt.active} playing={false} branches={branches} select={setBranchId} history={{ids:rt.session?.experiments??[],open:rt.history,disabled:rt.mutating}}/>
          </aside>
        </div>
        {counters.generated!==undefined&&<dl className="search-counts" aria-label="Actual search work">{[['Generated','generated'],['Screened','screened'],['Passed screening','screening_passed'],[cloth?'Validation rollouts':'Physics trials','fully_simulated'],['Verified feasible','verified_feasible']].map(([name,key])=><div key={key}><dt>{name}</dt><dd data-testid={`count-${key}`}>{Number(counters[key]??0).toLocaleString()}{!cloth&&!counters.adaptive_stopping&&key==='fully_simulated'&&Number(counters.physics_target)>0?` / ${Number(counters.physics_target).toLocaleString()}`:''}</dd></div>)}</dl>}
        </>}
      </>}
    </main>
    </>}
    {/* Keep Viva's implementation available for later frontend work without
        exposing its floating launcher in the current product. */}
    {false&&<VivaPanel world={compatible?rt.world:null} online={rt.online} canUndo={vivaUndoCount>0} execute={executeViva} cancelRun={()=>vivaRuntime.current.stop()}/>}
    {showOpening&&page==='home'&&<LabOpening config={ISABELLA_OPENING_CONFIG} finish={finishOpening}/>}
  </>;
}
