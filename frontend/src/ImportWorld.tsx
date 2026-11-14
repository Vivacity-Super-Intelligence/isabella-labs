import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ArrowRight,UploadSimple,WarningCircle} from '@phosphor-icons/react';
import {API,errorMessage} from './api';
import {workspaceToken} from './workspaceApi';
import TechnicalInspector from './TechnicalInspector';
import type {Event} from './domain';
import type {Preview} from './ImportScene';
import type {components} from './generated/api';

const ImportScene=lazy(()=>import('./ImportScene'));
const OrbitalTask=lazy(()=>import('./OrbitalTask'));
const RobotQualificationTrace=lazy(()=>import('./RobotQualificationTrace'));
const RobotTaskTrace=lazy(()=>import('./RobotTaskTrace'));
const AssemblyDesigner=lazy(()=>import('./AssemblyDesigner'));
type Record=components['schemas']['ImportResponse'];
type Config=components['schemas']['RobotTestCellConfig'];
type Task=Config['task'];

const defaults:Config={name:'Imported robot test',environment:'robotics_lab',task:'movement',end_effector_body:null,robot_base_offset_m:[0,0,0],base_mode:'free',gripper:'vivacity_force_fixture',gripper_strength_n:40,pickup_position_m:[.45,-.15,.08],destination_position_m:[.45,.18,.08],object_half_size_m:[.03,.03,.03],object_mass_kg:.08,sliding_friction:.8,cad_longest_dimension_m:.6};

function supportedTargets(config:Config):Config{
 const top=config.environment==='tabletop'?.375:config.environment==='warehouse_cell'?.16:0;
 const pickupFloor=top+(config.task==='pick_place'?config.object_half_size_m[2]:config.task==='reach'?.075:0);
 const destinationFloor=top+config.object_half_size_m[2];
 return {...config,
  pickup_position_m:[config.pickup_position_m[0],config.pickup_position_m[1],Math.max(config.pickup_position_m[2],pickupFloor)],
  destination_position_m:[config.destination_position_m[0],config.destination_position_m[1],Math.max(config.destination_position_m[2],destinationFloor)]};
}

function VectorFields({legend,value,onChange}:{legend:string;value:number[];onChange:(value:number[])=>void}){
 return <fieldset className="vector-fields"><legend>{legend}</legend>{(['X','Y','Z'] as const).map((axis,index)=><label key={axis}>{axis} <span>m</span><input type="number" min="-8" max="8" step="0.01" value={value[index]} onChange={event=>{const next=[...value];next[index]=Number(event.target.value);onChange(next);}}/></label>)}</fieldset>;
}

export default function ImportWorld(){
 const [mode,setMode]=useState<'robot'|'environment'>('robot'),[file,setFile]=useState<File|null>(null),[record,setRecord]=useState<Record|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[events,setEvents]=useState<Event[]>([]),[config,setConfig]=useState<Config>(defaults),[configDirty,setConfigDirty]=useState(true);
 const sequence=useRef(0),active=useRef(true);
 const log=(message:string)=>setEvents(items=>[...items,{schema_version:'1.0',seq:++sequence.current,kind:'progress',details:{message,timestamp_unix_s:Date.now()/1000}} as Event].slice(-160));
 const change=(next:Partial<Config>)=>{setConfig(value=>({...value,...next}));setConfigDirty(true);};
 async function load(id:string,includePreview=true){const headers={'X-Workspace-Token':workspaceToken()};const response=await fetch(`${API}/v1/imports/${encodeURIComponent(id)}`,{headers});const data=await response.json();if(!response.ok)throw new Error(data.detail);if(!active.current)return;setRecord(data);if(data.test_cell){setConfig({...defaults,...data.test_cell});setConfigDirty(false);}else if(data.assembly_status==='compiled'){setConfig({...defaults,environment:'tabletop',task:'movement',robot_base_offset_m:[.1,0,.4],end_effector_body:data.assembly_draft?.end_effector_part??null});setConfigDirty(true);}else if(data.preview_available){setConfig({...defaults,task:'static_drop'});setConfigDirty(true);}if(includePreview){setPreview(null);if(data.preview_available){const p=await fetch(`${API}/v1/imports/${encodeURIComponent(id)}/preview`,{headers});if(!p.ok)throw new Error('Preview unavailable');const decoded=await p.json();if(active.current)setPreview(decoded);}}}
 useEffect(()=>{active.current=true;let saved:string|null=null;try{saved=localStorage.getItem('vivacity:import');}catch{/* optional */}if(saved)load(saved).catch(e=>{if(active.current)setError(errorMessage(e));});return()=>{active.current=false;};},[]);
 const reset=()=>{setFile(null);setRecord(null);setPreview(null);setError(null);setConfig(defaults);setConfigDirty(true);try{localStorage.removeItem('vivacity:import');}catch{/* optional */}};
 const selectMode=(value:'robot'|'environment')=>{setMode(value);reset();};
 const stage=(next:File|undefined)=>{setError(null);if(!next)return;if(next.size>16*1024*1024){setError('The upload limit is 16 MiB.');return;}const pattern=mode==='robot'?/\.(xml|mjcf|urdf|zip|glb|gltf|obj|stl)$/i:/\.(glb|gltf|obj|stl|zip)$/i;if(!pattern.test(next.name)){setError(mode==='robot'?'Choose MJCF, URDF, STL, OBJ, GLB, GLTF, or a manifest ZIP bundle.':'Choose a GLB, GLTF, OBJ, STL, or manifest ZIP scene.');return;}setFile(next);};
 const chooseSample=async()=>{if(busy)return;setBusy(true);setError(null);try{const response=await fetch('/samples/vivacity-sample-arm.xml');if(!response.ok)throw new Error('Sample arm file could not be loaded.');const bytes=await response.blob();reset();setMode('robot');setFile(new File([bytes],'vivacity-sample-arm.xml',{type:'application/xml'}));setConfig({...defaults,environment:'tabletop',task:'movement'});log('Sample arm loaded as an ordinary MJCF upload. Stage it to run a measured trial.');}catch(cause){setError(errorMessage(cause));}finally{setBusy(false);}};
 const upload=async()=>{if(!file||busy)return;setBusy(true);setError(null);log(`Uploading ${file.name} (${file.size.toLocaleString()} bytes).`);try{const response=await fetch(`${API}/v1/imports?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Workspace-Token':workspaceToken()},body:file,signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Import validation failed');if(!active.current)return;log(`Upload inspected. ${result.summary.vertices??0} preview vertices and ${result.summary.joints??0} declared joints.`);await load(result.id);try{localStorage.setItem('vivacity:import',result.id);}catch{/* optional */}}catch(e){if(active.current){setError(errorMessage(e));log(`Import rejected: ${errorMessage(e)}.`);}}finally{if(active.current)setBusy(false);}};
 const post=async(path:string,method='POST',body?:unknown):Promise<boolean>=>{
  if(!record||busy)return false;
  setBusy(true);setError(null);
  try{
   const response=await fetch(`${API}/v1/imports/${record.id}/${path}`,{method,
    headers:{'X-Workspace-Token':workspaceToken(),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined});
   const data=await response.json();
   if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Request failed');
   setRecord(data);
   if(data.test_cell){setConfig({...defaults,...data.test_cell});setConfigDirty(false);}
   else if(data.assembly_status==='compiled'){
    setConfig({...defaults,environment:'tabletop',task:'movement',robot_base_offset_m:[.1,0,.4],
     end_effector_body:data.assembly_draft?.end_effector_part??null});setConfigDirty(true);
   }
   log(`${path==='task-trials'?'Task trial queued':path==='test-cell'?'Test cell configured':path==='assembly-draft'?'Assembly draft saved':path==='assembly-compile'?'Assembly compiled':'Initial diagnostic queued'}.`);
   return true;
  }catch(e){setError(errorMessage(e));log(`Action failed: ${errorMessage(e)}.`);return false;}
  finally{setBusy(false);}
 };
 useEffect(()=>{if(!record||record.status!=='physics_verifying')return;const timer=setInterval(()=>load(record.id,false).catch(e=>setError(errorMessage(e))),1200);return()=>clearInterval(timer);},[record?.id,record?.status]);
 useEffect(()=>{const importId=record?.id,trialId=record?.task_trial?.id;if(!importId||!trialId||record?.status!=='task_running')return;let stopped=false,timer=0,cursor=-1,delayMs=250;const poll=async()=>{try{const url=`${API}/v1/imports/${encodeURIComponent(importId)}/task-trials/${encodeURIComponent(trialId)}/frames?after=${cursor}&limit=16`;const response=await fetch(url,{headers:{'X-Workspace-Token':workspaceToken()}});const data=await response.json();if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'Live simulation update failed');if(stopped)return;cursor=data.next_cursor;setRecord(current=>{if(!current||current.id!==importId||current.task_trial?.id!==trialId)return current;const frames=[...current.task_trial.frames];const seen=new Set(frames.map(frame=>frame.seq));for(const frame of data.frames)if(!seen.has(frame.seq)){frames.push(frame);seen.add(frame.seq);}frames.sort((a,b)=>a.seq-b.seq);return {...current,status:data.status,task_trial:{...current.task_trial,...data,frames}};});if(data.status!=='task_running'){await load(importId,false);return;}delayMs=data.frames.length?100:Math.min(1000,Math.round(delayMs*1.5));timer=window.setTimeout(poll,delayMs);}catch(e){if(!stopped){setError(errorMessage(e));timer=window.setTimeout(poll,1000);}}};void poll();return()=>{stopped=true;window.clearTimeout(timer);};},[record?.id,record?.status,record?.task_trial?.id]);
 if(record?.configured_world_id)return <section className="import-area"><details><summary>Source and adaptation</summary><p>{record.filename}</p>{record.diagnostics.map(d=><p key={d}>{d}</p>)}<p className="small">Source SHA-256: {record.sha256}. This existing adapter replaces the original robot with a configured Panda task model.</p></details><Suspense fallback={<p>Loading task...</p>}><OrbitalTask worldId={record.configured_world_id}/></Suspense><button className="secondary" onClick={reset}>Import another robot</button></section>;
 const qualification=record?.capabilities?.qualification,trial=record?.task_trial;
 const staticCad=Boolean(record?.preview_available&&record.assembly_status!=='compiled'),native=Boolean(record&&(!record.preview_available||record.assembly_status==='compiled')),configurable=Boolean(record);
 const assemblyMeshes=(record?.summary?.assembly_meshes??[]) as string[];
 const tasks:{value:Task;label:string}[]=staticCad?[{value:'static_drop',label:'Rigid-body drop and collision'}]:[{value:'movement',label:'Joint movement'},{value:'reach',label:'Reach a point'},{value:'pick_place',label:'Pick and place'}];
 const heading=record?.status==='task_succeeded'?'Task succeeded':record?.status==='task_failed'?'Task failed':record?.status==='task_running'?'Task running':record?.test_cell?'Ready to run':'Ready to configure';
 return <section className="import-area"><div className="workspace-intro"><div><span className="eyebrow">Uploaded robot test cell</span><h1>Place it. Configure it. Run physics.</h1><p>Upload a jointed robot or CAD mesh, choose the workcell and task, then inspect measured MuJoCo motion. Upload inspection is not a task verdict.</p></div></div>
  <nav className="creation-tabs" aria-label="Import type"><button aria-pressed={mode==='robot'} onClick={()=>selectMode('robot')}>Robot or CAD</button><button aria-pressed={mode==='environment'} onClick={()=>selectMode('environment')}>Environment geometry</button></nav>
  <div className="import-drop" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(event.dataTransfer.files.length!==1)setError('Upload one file or one ZIP bundle at a time.');else stage(event.dataTransfer.files[0]);}}><UploadSimple size={24}/><label htmlFor="world-file">{mode==='robot'?'Choose robot or CAD file':'Choose environment geometry'}</label><input id="world-file" type="file" accept={mode==='robot'?'.xml,.mjcf,.urdf,.zip,.glb,.gltf,.obj,.stl':'.glb,.gltf,.obj,.stl,.zip'} disabled={busy} onChange={event=>stage(event.target.files?.[0])}/><p>{mode==='robot'?'MJCF and eligible URDF can run bounded movement tasks. STL, OBJ, GLB and GLTF support real rigid-body fit, drop and collision trials.':'Imported geometry remains visual until mapped into a supported world.'} Maximum 16 MiB.</p>{file&&<p className="small" role="status">Selected: {file.name}</p>}<button className="primary" disabled={!file||busy} onClick={upload}>{busy?'Working...':mode==='robot'?'Stage in lab':'Inspect geometry'}<ArrowRight size={17}/></button>{mode==='robot'&&<div className="sample-arm-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void chooseSample()}>Use sample arm</button><a href="/samples/vivacity-sample-arm.xml" download>Download sample MJCF</a></div>}</div>
  {error&&<p className="error-notice" role="alert">{error}</p>}
  {record&&<div className="import-result"><div>{trial?<Suspense fallback={<div className="viewport-loading">Loading measured task...</div>}><RobotTaskTrace trial={trial} importId={record.id}/></Suspense>:qualification&&!record.test_cell?<Suspense fallback={<div className="viewport-loading">Loading diagnostic...</div>}><RobotQualificationTrace report={qualification}/></Suspense>:preview?<Suspense fallback={<div className="viewport-loading">Loading CAD...</div>}><ImportScene preview={preview}/></Suspense>:<div className="description-preview"><h2>Robot staged</h2><dl>{Object.entries(record.summary).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{String(value)}</dd></div>)}</dl><p>Choose a test cell and task. Nothing has been declared successful or failed yet.</p></div>}</div>
   <aside className="import-details"><h2>{heading}</h2><p>{record.filename}</p>{record.diagnostics.map(d=><p key={d}>{d}</p>)}{!trial&&<p className="small">Nothing has been declared successful or failed yet.</p>}
    {mode==='robot'&&assemblyMeshes.length>=2&&<Suspense fallback={<p>Loading assembly setup…</p>}><AssemblyDesigner importId={record.id} meshes={assemblyMeshes} saved={record.assembly_draft} status={record.assembly_status} busy={busy} onStage={draft=>post('assembly-draft','PUT',draft)} onCompile={()=>{void post('assembly-compile');}}/></Suspense>}
    {mode==='robot'&&configurable&&<form className="test-cell-form" onSubmit={event=>{event.preventDefault();void post('test-cell','PUT',config);}}>
     <h3>Test setup</h3><label>Experiment name<input value={config.name} maxLength={80} onChange={event=>change({name:event.target.value})}/></label>
     <label>Environment<select value={config.environment} onChange={event=>{setConfig(value=>supportedTargets({...value,environment:event.target.value as Config['environment']}));setConfigDirty(true);}}><option value="robotics_lab">Robotics lab floor</option><option value="tabletop">Tabletop workcell</option><option value="warehouse_cell">Warehouse pallet cell</option></select></label>
     <label>Task<select value={config.task} onChange={event=>{setConfig(value=>supportedTargets({...value,task:event.target.value as Task}));setConfigDirty(true);}}>{tasks.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
     {!staticCad&&<><label>Base placement<select value={config.base_mode} onChange={event=>change({base_mode:event.target.value as Config['base_mode']})}><option value="free">Free · gravity can move the robot</option><option value="bolted">Bolted · visible fixed mount</option>{config.base_mode==='legacy_source'&&<option value="legacy_source">Original source anchor · previous setup</option>}</select></label><p className="small">Free placement lets a raised arm fall. Choose a bolted mount for a stationary reach task.</p><VectorFields legend="Robot base position offset" value={config.robot_base_offset_m} onChange={value=>change({robot_base_offset_m:value})}/></>}
     {native&&<label>End-effector body <span>optional</span><input value={config.end_effector_body??''} placeholder="Use the last submitted body" onChange={event=>change({end_effector_body:event.target.value||null})}/></label>}
     {config.task==='pick_place'&&<><label>Gripper model<select value={config.gripper} onChange={event=>change({gripper:event.target.value as Config['gripper']})}><option value="vivacity_force_fixture">Visible force-limited test fixture</option><option value="none">No gripper</option></select></label><label>Grip force <span>N</span><input type="number" min="1" max="200" step="1" value={config.gripper_strength_n} onChange={event=>change({gripper_strength_n:Number(event.target.value)})}/></label></>}
     {(staticCad||config.task==='reach'||config.task==='pick_place')&&<VectorFields legend={staticCad?'Initial CAD position':config.task==='reach'?'Reach target position':'Pickup object center'} value={config.pickup_position_m} onChange={value=>change({pickup_position_m:value})}/>}
     {config.task==='pick_place'&&<VectorFields legend="Destination position" value={config.destination_position_m} onChange={value=>change({destination_position_m:value})}/>}
     {staticCad&&<label>CAD longest dimension <span>m</span><input type="number" min="0.05" max="3" step="0.05" value={config.cad_longest_dimension_m} onChange={event=>change({cad_longest_dimension_m:Number(event.target.value)})}/></label>}
     {config.task==='pick_place'&&<VectorFields legend="Object half-size" value={config.object_half_size_m} onChange={value=>change({object_half_size_m:value})}/>}
     <div className="test-materials"><label>Test mass <span>kg</span><input type="number" min="0.01" max="2" step="0.01" value={config.object_mass_kg} onChange={event=>change({object_mass_kg:Number(event.target.value)})}/></label><label>Sliding friction<input type="number" min="0.05" max="2" step="0.05" value={config.sliding_friction} onChange={event=>change({sliding_friction:Number(event.target.value)})}/></label></div>
     <button className="primary" disabled={busy}>{busy?'Saving...':record.test_cell?'Update test cell':'Place in test cell'}</button>
    </form>}
    {configurable&&record.test_cell&&<button className="run-task" disabled={busy||configDirty||record.status==='task_running'} onClick={()=>post('task-trials')}>{record.status==='task_running'?'Simulating...':configDirty?'Update test cell first':'Run configured task'}<ArrowRight size={17}/></button>}
    {native&&<details className="diagnostic-panel"><summary>Optional initial-condition diagnostic</summary><p>Checks gravity settling, joint limits, actuator response and local mobility. Its result does not decide whether your configured task succeeds.</p><button className="secondary" type="button" disabled={busy||record.status==='physics_verifying'} onClick={()=>post('qualification')}>{record.status==='physics_verifying'?'Running diagnostic...':'Run initial diagnostic'}</button>{qualification&&<p className="diagnostic-result"><WarningCircle size={16}/>{qualification.verdict.replaceAll('_',' ')}: {qualification.failure_class.replaceAll('_',' ')}</p>}</details>}
    {trial&&<details><summary>Measured trial record</summary><p className="small">Source SHA-256: {trial.source_sha256}</p><pre className="generation-spec">{JSON.stringify(trial.measurements,null,2)}</pre></details>}
   </aside></div>}
  {record&&<button className="secondary import-reset" type="button" disabled={busy} onClick={reset}>Import another asset</button>}
  <TechnicalInspector events={events} initialized playing={record?.status==='task_running'} branches={[]} select={()=>{}} history={{ids:[],open:()=>{},disabled:true}} initialMessage="Upload inspection stages the asset. A result exists only after an explicit trial."/>
 </section>;
}
