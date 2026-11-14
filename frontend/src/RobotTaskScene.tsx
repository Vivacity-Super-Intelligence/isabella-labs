import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {BufferAttribute,BufferGeometry,Color,Group,Quaternion,SRGBColorSpace,Vector3} from 'three';
import type {components} from './generated/api';
import {API} from './api';
import {workspaceToken} from './workspaceApi';
import SceneBoundary from './SceneBoundary';

type Trial=components['schemas']['RobotTaskTrial'];
type Frame=Trial['frames'][number];
type Vec3=[number,number,number];
type MeshSpec={id:number;positions:{byte_offset:number;count:number};indices:{byte_offset:number;count:number}};
type Geom={id:number;name:string;body_id:number;type:string;group:number;mesh_id:number|null;position:Vec3;quaternion_wxyz:number[];size:Vec3;rgba:number[];contype:number;conaffinity:number};
type Scene={schema_version:string;model_hash:string;base_mode?:'free'|'bolted'|'legacy_source';bodies:{id:number;name:string;parent_id:number}[];joints:{id:number;name:string;body_id:number}[];geoms:Geom[];meshes:MeshSpec[];destination_position_m:Vec3;task_target_position_m?:Vec3|null};
const quaternion=(q:number[])=>new Quaternion(q[1],q[2],q[3],q[0]);

function cameraFraming(scene:Scene,frame:Frame){
 const selected=new Set<number>();
 for(const joint of scene.joints){
  let id=joint.body_id;
  while(id>0&&!selected.has(id)){selected.add(id);id=scene.bodies[id]?.parent_id??0;}
 }
 if(!selected.size)for(const body of scene.bodies)if(body.id>0)selected.add(body.id);
 const points:Vec3[]=[];
 for(const id of selected){const point=frame.positions_m[id-1];if(point)points.push(point as Vec3);}
 for(const geom of scene.geoms){
  if(!selected.has(geom.body_id)&&geom.name!=='vivacity_table')continue;
  const base=geom.body_id===0?[0,0,0]:frame.positions_m[geom.body_id-1];
  if(!base)continue;
  const center=base.map((value,i)=>value+geom.position[i]) as Vec3;
  const radius=Math.max(...geom.size,.04);
  points.push(center.map(value=>value-radius) as Vec3,center.map(value=>value+radius) as Vec3);
 }
 if(!points.length)points.push([.4,0,.4]);
 const min=[0,1,2].map(i=>Math.min(...points.map(point=>point[i])));
 const max=[0,1,2].map(i=>Math.max(...points.map(point=>point[i])));
 const target=min.map((value,i)=>(value+max[i])/2) as Vec3;
 const radius=Math.max(.45,Math.hypot(...max.map((value,i)=>value-min[i]))/2);
 const distance=radius/Math.sin(42*Math.PI/360)*1.2;
 return {target,position:[target[0]+distance*.7,target[1]-distance*.85,target[2]+distance*.65] as Vec3,distance};
}

function CameraRig({target,distance}:{target:Vec3;distance:number}){
 const {camera,invalidate}=useThree();
 useEffect(()=>{
  camera.up.set(0,0,1);
  camera.position.set(target[0]+distance*.7,target[1]-distance*.85,target[2]+distance*.65);
  camera.lookAt(...target);
  camera.updateProjectionMatrix();invalidate();
 },[camera,invalidate,target[0],target[1],target[2],distance]);
 return null;
}

function BodyPose({name,position,rotation,live,children}:{name:string;position:Vec3;rotation:number[];live:boolean;children:ReactNode}){
 const {invalidate}=useThree();
 const group=useRef<Group>(null),initialized=useRef(false),active=useRef(false);
 const fromPosition=useRef(new Vector3()),toPosition=useRef(new Vector3());
 const fromRotation=useRef(new Quaternion()),toRotation=useRef(new Quaternion());
 const started=useRef(0);
 useLayoutEffect(()=>{
  if(!group.current)return;
  const destination=new Vector3(...position),orientation=quaternion(rotation);
  if(!live||!initialized.current){
   group.current.position.copy(destination);group.current.quaternion.copy(orientation);
   active.current=false;initialized.current=true;
  }else{
   fromPosition.current.copy(group.current.position);fromRotation.current.copy(group.current.quaternion);
   toPosition.current.copy(destination);toRotation.current.copy(orientation);
   started.current=performance.now();active.current=true;
  }
  invalidate();
 },[position[0],position[1],position[2],rotation[0],rotation[1],rotation[2],rotation[3],live,invalidate]);
 useFrame(()=>{
  if(!active.current||!group.current)return;
  // Only interpolate between poses already delivered by the server. Once the
  // target is reached, demand rendering stops and a stalled feed stays still.
  const fraction=Math.min(1,(performance.now()-started.current)/90);
  group.current.position.lerpVectors(fromPosition.current,toPosition.current,fraction);
  group.current.quaternion.copy(fromRotation.current).slerp(toRotation.current,fraction);
  if(fraction<1)invalidate();else active.current=false;
 });
 return <group ref={group} name={name}>{children}</group>;
}

function SceneGeom({geom,geometry,stressed,selected,collision,contactHit}:{geom:Geom;geometry?:BufferGeometry;stressed:boolean;selected:boolean;collision:boolean;contactHit:boolean}){
 const q=quaternion(geom.quaternion_wxyz);
 if(geom.type==='cylinder'||geom.type==='capsule')q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2));
 const color=new Color().setRGB(geom.rgba[0],geom.rgba[1],geom.rgba[2],SRGBColorSpace);
 const size=geom.size;
 return <mesh name={geom.name} position={geom.position} quaternion={q} scale={geom.type==='ellipsoid'?size:undefined} geometry={geometry} castShadow receiveShadow>
  {geom.type==='box'&&<boxGeometry args={[size[0]*2,size[1]*2,size[2]*2]}/>}
  {geom.type==='plane'&&<planeGeometry args={[8,8]}/>}
  {geom.type==='sphere'&&<sphereGeometry args={[size[0],24,16]}/>}
  {geom.type==='ellipsoid'&&<sphereGeometry args={[1,24,16]}/>}
  {geom.type==='cylinder'&&<cylinderGeometry args={[size[0],size[0],size[1]*2,24]}/>}
  {geom.type==='capsule'&&<capsuleGeometry args={[size[0],size[1]*2,8,16]}/>}
  <meshStandardMaterial color={contactHit?'#ffb348':stressed?'#f34239':selected?'#91d9d5':color}
   transparent={contactHit||stressed||geom.rgba[3]<1||collision} opacity={contactHit ? .78 : stressed ? .7 : collision ? .4 : geom.rgba[3]}
   wireframe={collision} roughness={.6} metalness={geom.body_id>0?.14:0} depthWrite={!collision}/>
 </mesh>;
}

export default function RobotTaskScene({importId,trial,frame,selectedJoint,selectedContact,onClearSelection}:{importId:string;trial:Trial;frame?:Frame;selectedJoint:string|null;selectedContact:number[];onClearSelection:()=>void}){
 const rootRef=useRef<HTMLDivElement>(null);
 const [scene,setScene]=useState<Scene|null>(null),[meshBuffer,setMeshBuffer]=useState<ArrayBuffer|null>(null);
 const [error,setError]=useState<string|null>(null),[collision,setCollision]=useState(false);
 useEffect(()=>{if(selectedJoint||selectedContact.length)rootRef.current?.scrollIntoView({
  behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'
 });},[selectedJoint,selectedContact]);
 useEffect(()=>{
  let stopped=false;const controller=new AbortController();
  setScene(null);setMeshBuffer(null);setError(null);
  const base=`${API}/v1/imports/${encodeURIComponent(importId)}/task-trials/${encodeURIComponent(trial.id)}`;
  const load=async()=>{
   for(let attempt=0;attempt<240&&!stopped;attempt++){
    try{
     const response=await fetch(`${base}/scene`,{signal:controller.signal,headers:{'X-Workspace-Token':workspaceToken()}});
     if(response.status===404&&trial.status==='running'){
      await new Promise(resolve=>setTimeout(resolve,250));continue;
     }
     if(!response.ok)throw new Error(`Compiled scene unavailable (${response.status}).`);
     const manifest=await response.json() as Scene;
     const bufferResponse=await fetch(`${base}/meshes.bin`,{signal:controller.signal,headers:{'X-Workspace-Token':workspaceToken()}});
     if(!bufferResponse.ok)throw new Error(`Compiled visual mesh unavailable (${bufferResponse.status}).`);
     const buffer=await bufferResponse.arrayBuffer();
     if(stopped)return;
     for(const mesh of manifest.meshes){
      if(mesh.positions.byte_offset+mesh.positions.count*4>buffer.byteLength||mesh.indices.byte_offset+mesh.indices.count*4>buffer.byteLength)
       throw new Error('Compiled scene mesh buffer is incomplete.');
     }
     setScene(manifest);setMeshBuffer(buffer);return;
    }catch(cause){if(stopped)return;setError(cause instanceof Error?cause.message:'Compiled scene could not be loaded.');return;}
   }
   if(!stopped)setError('Compiled scene did not become available during this trial.');
  };
  void load();return()=>{stopped=true;controller.abort();};
 },[importId,trial.id,trial.status==='running']);
 const meshes=useMemo(()=>{
  const map=new Map<number,BufferGeometry>();if(!scene||!meshBuffer)return map;
  for(const mesh of scene.meshes){const geometry=new BufferGeometry();
   geometry.setAttribute('position',new BufferAttribute(new Float32Array(meshBuffer,mesh.positions.byte_offset,mesh.positions.count),3));
   geometry.setIndex(new BufferAttribute(new Uint32Array(meshBuffer,mesh.indices.byte_offset,mesh.indices.count),1));
   geometry.computeVertexNormals();map.set(mesh.id,geometry);
  }return map;
 },[scene,meshBuffer]);
 useEffect(()=>()=>{for(const geometry of meshes.values())geometry.dispose();},[meshes]);
 const jointBody=new Map(scene?.joints.map(joint=>[joint.name,joint.body_id])??[]);
 const stressed=new Set<number>();
 for(const joint of frame?.joint_states??[]){
  const row=joint as {joint?:string;force_limit_reached?:boolean;joint_limit_violation?:boolean;control_saturated?:boolean;force_utilization?:number|null};
  if(row.joint&&(row.force_limit_reached||row.joint_limit_violation||row.control_saturated||(row.force_utilization??0)>=.95)){
   const body=jointBody.get(row.joint);if(body!==undefined)stressed.add(body);
  }
 }
 const selectedBody=selectedJoint?jointBody.get(selectedJoint):undefined;
 const contactIds=new Set<number>(selectedContact);
 for(const contact of frame?.contacts??[]){const item=contact as {geom_a_id?:number;geom_b_id?:number;prohibited?:boolean;normal_force_n?:number};
  if(item.prohibited&&(item.normal_force_n??0)>=.5){if(item.geom_a_id!=null)contactIds.add(item.geom_a_id);if(item.geom_b_id!=null)contactIds.add(item.geom_b_id);}
 }
 const visibleContactIds=new Set([...contactIds].filter(id=>scene?.geoms.find(geom=>geom.id===id)?.body_id!==0));
 const framing=scene&&trial.frames.length?cameraFraming(scene,trial.frames[0]):{target:[.38,0,.38] as Vec3,position:[1.55,-1.6,1.22] as Vec3,distance:2};
 const selectedPose=selectedBody&&trial.frames[0]?.positions_m[selectedBody-1];
 // Keep the whole workcell legible while drawing attention to the selected
 // component. A tight zoom made large imported robots clip out of view.
 const viewTarget=selectedPose?framing.target.map((value,i)=>value*.65+selectedPose[i]*.35) as Vec3:framing.target;
 const viewDistance=selectedPose?Math.max(1.1,framing.distance*.62):framing.distance;
 const visible=(geom:Geom)=>geom.group!==3||collision||!scene?.geoms.some(other=>other.body_id===geom.body_id&&other.group===1);
 return <div className="import-live-scene" ref={rootRef}>
  <div className="import-scene-toolbar"><span>{scene?`Compiled MuJoCo model · ${scene.base_mode==='free'?'free under gravity':scene.base_mode==='bolted'?'bolted to visible mount':'source-defined anchor'} · measured live poses`:'Preparing compiled scene'}</span>
   {(selectedPose||selectedContact.length>0)&&<button type="button" className="component-focus" onClick={onClearSelection}>Fit workcell</button>}
   <label><input type="checkbox" checked={collision} onChange={event=>setCollision(event.target.checked)}/> Collision geometry</label></div>
  {error?<p role="alert" className="error-notice">{error}</p>:!scene||!frame?<div className="viewport-loading" role="status">{trial.status==='running'?'Waiting for the first measured pose…':'No measured scene frame is available.'}</div>:
   <div className="import-scene-canvas" role="img" data-frame-seq={frame.seq}
    data-highlight-body-id={selectedBody??''} data-stressed-body-ids={[...stressed].join(',')}
    data-contact-geom-ids={[...visibleContactIds].join(',')}
    aria-label={`3D MuJoCo workcell at ${frame.time_s.toFixed(2)} simulated seconds; red indicates a load limit and amber indicates prohibited contact`}>
    <SceneBoundary><Canvas frameloop="demand" dpr={[1,1.5]} shadows camera={{position:framing.position,near:.01,far:80,fov:42}}
     onCreated={({gl})=>{gl.setClearColor('#1b2224');}}>
     <CameraRig target={viewTarget} distance={viewDistance}/>
     <ambientLight intensity={1.25}/><directionalLight position={[.5,-1.5,3]} intensity={2.1} castShadow shadow-mapSize={[1024,1024]}/>
     {scene.bodies.map(body=>{
      const bodyGeoms=scene.geoms.filter(geom=>geom.body_id===body.id&&visible(geom));
      const position=body.id===0?[0,0,0]:frame.positions_m[body.id-1];
      const rotation=body.id===0?[1,0,0,0]:frame.quaternions_wxyz[body.id-1];
      if(!position||!rotation)return null;
      return <BodyPose key={body.id} name={body.name} position={position as Vec3} rotation={rotation}
       live={trial.status==='running'&&!selectedJoint}>
      {bodyGeoms.map(geom=><group key={geom.id}>
       {geom.group!==3||!collision?<SceneGeom geom={geom} geometry={geom.mesh_id==null?undefined:meshes.get(geom.mesh_id)}
        stressed={stressed.has(body.id)} selected={body.id===selectedBody} collision={false} contactHit={visibleContactIds.has(geom.id)}/>:null}
       {collision&&(geom.contype!==0||geom.conaffinity!==0)&&<SceneGeom geom={geom} geometry={geom.mesh_id==null?undefined:meshes.get(geom.mesh_id)}
        stressed={false} selected={false} collision={true} contactHit={false}/>}
      </group>)}
      </BodyPose>;
     })}
     {scene.task_target_position_m&&<mesh position={scene.task_target_position_m} rotation={[0,0,0]}><torusGeometry args={[.045,.005,8,32]}/><meshBasicMaterial color="#f44f48"/></mesh>}
     <OrbitControls makeDefault target={viewTarget} minDistance={.25} maxDistance={Math.max(5,framing.distance*3)}/>
    </Canvas></SceneBoundary>
   </div>}
  <p className="small">Red: {stressed.size?`${stressed.size} body ${stressed.size===1?'area':'areas'} at a declared limit or at least 95% of actuator effort.`:'No declared load or limit event in this frame.'} Amber: {visibleContactIds.size?'measured prohibited contact geometry.':'no prohibited contact at this frame.'} These are simulation findings, not proof of a broken part.</p>
 </div>;
}
