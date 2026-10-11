import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color, Group, Quaternion, Vector3, SRGBColorSpace } from 'three';
import { ArrowCounterClockwise, Cube, Target } from '@phosphor-icons/react';
import type { Dict, RobotFrame, Vec3 } from './domain';

type MeshSpec = { id: number; positions: { byte_offset: number; count: number }; indices: { byte_offset: number; count: number } };
type Geom = { id: number; name: string; body_id: number; type: string; group: number; mesh_id: number | null; position: Vec3; quaternion_wxyz: number[]; size: Vec3; rgba: number[] };
type Manifest = { bodies: {id: number; name: string}[]; geoms: Geom[]; meshes: MeshSpec[] };
export type Assets = { manifest: Manifest; geometry: Map<number,BufferGeometry> };
let assetPromise: Promise<Assets> | null = null;
export function loadAssets() {
  if (!assetPromise) assetPromise = (async () => {
    const start = performance.now();
    const [a,b] = await Promise.all([fetch('/vivacity/robot-geometry.json'), fetch('/vivacity/robot-meshes.bin')]);
    if (!a.ok || !b.ok) throw new Error('Robot geometry assets could not be loaded.');
    const manifest = await a.json() as Manifest, buffer = await b.arrayBuffer();
    const geometry = new Map<number,BufferGeometry>();
    for (const mesh of manifest.meshes) {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(buffer, mesh.positions.byte_offset, mesh.positions.count),3));
      g.setIndex(new BufferAttribute(new Uint32Array(buffer,mesh.indices.byte_offset,mesh.indices.count),1));
      g.computeVertexNormals(); g.computeBoundingSphere(); geometry.set(mesh.id,g);
    }
    (window as unknown as { __vivacityPerformance: Dict }).__vivacityPerformance = {
      ...((window as unknown as {__vivacityPerformance?: Dict}).__vivacityPerformance ?? {}), robotAssetLoadMs: performance.now()-start, meshBytes: buffer.byteLength
    };
    return { manifest, geometry };
  })().catch(err => { assetPromise = null; throw err; });
  return assetPromise;
}
const quaternion = (q: number[]) => new Quaternion(q[1],q[2],q[3],q[0]);

type CameraController={target:Vector3;getPolarAngle:()=>number;setPolarAngle:(n:number)=>void;getAzimuthalAngle:()=>number;setAzimuthalAngle:(n:number)=>void;update:()=>unknown};
function CameraInteraction({command}:{command:{key:string;seq:number}}){
  const controls=useRef<CameraController|null>(null);
  const {camera,invalidate}=useThree();
  useEffect(()=>{
    const c=controls.current;if(!c||!command.key)return;
    if(command.key==='ArrowLeft'||command.key==='ArrowRight')c.setAzimuthalAngle(c.getAzimuthalAngle()+(command.key==='ArrowLeft'?.12:-.12));
    if(command.key==='ArrowUp'||command.key==='ArrowDown')c.setPolarAngle(Math.max(.1,Math.min(Math.PI*.49,c.getPolarAngle()+(command.key==='ArrowUp'?-.1:.1))));
    if(['+','=','-'].includes(command.key)){camera.position.sub(c.target).multiplyScalar(command.key==='-'?1.15:1/1.15).add(c.target);c.update();}
    invalidate();
  },[command,camera,invalidate]);
  return <OrbitControls ref={c=>{controls.current=c;}} makeDefault target={[.32,.08,.28]} minDistance={.7} maxDistance={4} maxPolarAngle={Math.PI*.49} enableDamping dampingFactor={.12} />;
}

export function GeomMesh({ geom, assets, config }: { geom: Geom; assets: Assets; config: Dict }) {
  const q = quaternion(geom.quaternion_wxyz);
  if(geom.type==='cylinder'||geom.type==='capsule')q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2));
  const size = (geom.name === 'obstacle_geom' ? config.obstacle_size ?? geom.size : geom.name === 'cube' && config.task === 'pick_place'
    ? [Number(config.cube_half_size??.025),Number(config.cube_half_size??.025),Number(config.cube_half_size??.025)] : geom.size) as Vec3;
  const color = useMemo(() => new Color().setRGB(geom.rgba[0],geom.rgba[1],geom.rgba[2],SRGBColorSpace),[geom]);
  return <mesh position={geom.position} quaternion={q} geometry={geom.mesh_id !== null ? assets.geometry.get(geom.mesh_id) : undefined} castShadow={geom.type !== 'plane'} receiveShadow>
    {geom.type === 'box' && <boxGeometry args={[size[0]*2,size[1]*2,size[2]*2]} />}
    {geom.type === 'plane' && <planeGeometry args={[6,6]} />}
    {geom.type === 'cylinder' && <cylinderGeometry args={[size[0],size[0],size[1]*2,36]} />}
    {geom.type === 'capsule' && <capsuleGeometry args={[size[0],size[1]*2,8,20]} />}
    <meshStandardMaterial color={color} roughness={geom.name === 'table' ? .78 : .38} metalness={geom.group === 2 ? .18 : .05} />
  </mesh>;
}

function MeasuredRobot({ assets, frames, cursor, config, playing, renderTime }: { assets: Assets; frames: RobotFrame[]; cursor: RefObject<number>; config: Dict; playing:boolean; renderTime:number }) {
  const invalidate=useThree(state=>state.invalidate);
  useEffect(()=>{invalidate();},[invalidate,frames,playing,renderTime]);
  const groups = useRef(new Map<string,Group>()), marker = useRef<Group>(null);
  const poseA = new Vector3(), poseB = new Vector3(), qa = new Quaternion(), qb = new Quaternion();
  const frameTimes = useRef<number[]>([]);
  const lastPlaybackFrame=useRef<number|null>(null);
  useEffect(()=>{lastPlaybackFrame.current=playing?performance.now():null;if(playing)frameTimes.current=[];},[playing]);
  useFrame((_state,delta) => {
    if(playing) invalidate();
    if (!frames.length) return;
    const t = frames[0].time+cursor.current;
    let i = frames.findIndex(frame => frame.time >= t); if (i < 0) i = frames.length-1;
    const a = frames[Math.max(0,i-1)], b = frames[i];
    const alpha = b.time > a.time ? Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time))) : 0;
    const diagnostics: Record<string,number[]> = {};
    const orientations:Record<string,number[]>={};
    a.body_transforms.forEach((pose,index) => {
      const next = b.body_transforms[index]; const group = groups.current.get(pose.name);
      if (!group || !next) return;
      group.position.copy(poseA.fromArray(pose.position).lerp(poseB.fromArray(next.position),alpha));
      qa.set(pose.quaternion_wxyz[1],pose.quaternion_wxyz[2],pose.quaternion_wxyz[3],pose.quaternion_wxyz[0]);
      qb.set(next.quaternion_wxyz[1],next.quaternion_wxyz[2],next.quaternion_wxyz[3],next.quaternion_wxyz[0]);
      group.quaternion.copy(qa.slerp(qb,alpha)); diagnostics[pose.name] = group.position.toArray();
      orientations[pose.name]=[group.quaternion.w,group.quaternion.x,group.quaternion.y,group.quaternion.z];
    });
    const end = poseA.fromArray(a.end_effector).lerp(poseB.fromArray(b.end_effector),alpha);
    marker.current?.position.copy(end);
    (window as unknown as {__vivacityScene: unknown}).__vivacityScene = { time: t, endEffector: end.toArray(), bodies: diagnostics, orientationsWXYZ:orientations, cameraPosition:_state.camera.position.toArray(), source: 'measured_mujoco_frames', interpolated: alpha > 0 && alpha < 1 };
    const now=performance.now();
    if(playing && lastPlaybackFrame.current!==null){frameTimes.current.push(now-lastPlaybackFrame.current);lastPlaybackFrame.current=now;}
    if (frameTimes.current.length > 180) frameTimes.current.shift();
    if (frameTimes.current.length >= 2 && playing) {
      const d = window as unknown as {__vivacityPerformance: Dict};
      d.__vivacityPerformance = { ...d.__vivacityPerformance, playbackFrameSamples:frameTimes.current.length, renderMeanFrameMs: frameTimes.current.reduce((s,n)=>s+n,0)/frameTimes.current.length,
        renderP95FrameMs:[...frameTimes.current].sort((a,b)=>a-b)[Math.ceil(frameTimes.current.length*.95)-1] };
    }
  });
  const target = (config.task==='pick_place'?config.placement_position:config.target_position) as Vec3;
  const path = useMemo(() => frames.map(f=>f.end_effector),[frames]);
  const contacts = frames.at(-1)?.contacts ?? [];
  const collisionBodies = new Set(contacts.flatMap(c=>c.bodies).filter(n=>n !== 'obstacle' && n !== 'world'));
  const last = frames.at(-1);
  return <group dispose={null}>
    {assets.manifest.bodies.map(body => <group key={body.id} ref={g=>{ if (g) groups.current.set(body.name,g); else groups.current.delete(body.name); }}>
      {assets.manifest.geoms.filter(g=>g.body_id === body.id && (g.group === 0 || g.group === 2) && !(g.name==='obstacle_geom'&&config.obstacle_enabled===false) && !(last?.environment_geometries && ['table','ground','cube','obstacle_geom'].includes(g.name))).map(geom=><GeomMesh key={geom.id} geom={geom} assets={assets} config={config} />)}
    </group>)}
    {last?.environment_geometries?.map((geom,i)=><GeomMesh key={geom.name} geom={{...geom,id:i,body_id:0,group:0,mesh_id:null}} assets={assets} config={{}} />)}
    <gridHelper args={[5,40,'#777970','#aaa99e']} rotation={[Math.PI/2,0,0]} position={[0,0,-.798]} />
    {path.length > 1 && <Line points={path} color={contacts.length ? '#d23a21' : '#2455ff'} lineWidth={2.3} />}
    <group position={target}>
      <mesh><sphereGeometry args={[.011,20,20]} /><meshStandardMaterial color="#2455ff" /></mesh>
      <mesh><ringGeometry args={[.038,.041,36]} /><meshBasicMaterial color="#2455ff" side={2} /></mesh>
      <Line points={[[0,0,-.07],[0,0,.045]]} color="#2455ff" lineWidth={1.2} dashed dashSize={.01} gapSize={.008} />
    </group>
    <group ref={marker}><mesh><sphereGeometry args={[.006,12,12]} /><meshBasicMaterial color="#2455ff" /></mesh></group>
    {last?.body_transforms.filter(t=>collisionBodies.has(t.name)).map(pose=><mesh key={pose.name} position={pose.position}>
      <sphereGeometry args={[.055,18,18]} /><meshBasicMaterial color="#d23a21" wireframe transparent opacity={.65} />
    </mesh>)}
  </group>;
}

class SceneBoundary extends Component<{children: ReactNode}, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="scene-unavailable">3D rendering is unavailable. Your experiment data remains accessible in the inspector. Try a WebGL2-capable browser.</div> : this.props.children; }
}

function RobotView({ frames, cursor, config, playing, renderTime }: { frames: RobotFrame[]; cursor: RefObject<number>; config: Dict; replaying: boolean; playing:boolean; renderTime:number }) {
  const [assets,setAssets] = useState<Assets | null>(null), [error,setError] = useState<string | null>(null), [cameraKey,setCameraKey] = useState(0);
  const [cameraCommand,setCameraCommand]=useState({key:'',seq:0});
  const resetCamera=()=>{setCameraCommand(c=>({key:'',seq:c.seq+1}));setCameraKey(k=>k+1);};
  useEffect(() => { let active = true; loadAssets().then(a=>active&&setAssets(a)).catch(e=>active&&setError(String(e))); return ()=>{ active=false; }; },[]);
  return <div className="robot-viewport" data-testid="robot-viewport" tabIndex={0} role="region" aria-label="Franka Panda workcell. Arrow keys orbit, plus and minus zoom, R resets camera. Actual MuJoCo geometry and measured transforms." onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)){e.preventDefault();setCameraCommand(c=>({key:e.key,seq:c.seq+1}));}else if(e.key.toLowerCase()==='r'){e.preventDefault();resetCamera();}}}>
    <div className="viewport-label"><span className="mono">ROBOTICS WORKCELL</span><span>Measured simulator state</span></div>
    {error ? <div className="scene-unavailable" role="alert">{error}</div> : !assets || !frames.length ? <div className="scene-unavailable"><Cube size={24} />{!assets ? 'Loading Panda geometry…' : 'Waiting for a measured world state…'}</div> : <SceneBoundary>
      <Canvas key={cameraKey} frameloop="demand" shadows dpr={[1,1.25]} camera={{ position: config.scene_profile==='orbital_salvage'?[1.4,1.5,1.3]:[1.5,-1.6,1.25], fov: 38, near: .01, far: 15 }} gl={{ antialias: true, preserveDrawingBuffer: true }} onCreated={({camera,gl})=>{ camera.up.set(0,0,1); gl.setClearColor('#deddd4'); performance.mark('vivacity:robot-scene-ready'); }}>
        <ambientLight intensity={.72} /><hemisphereLight args={['#ffffff','#6f706a',1.8]} />
        <directionalLight position={[1,-1.5,3]} intensity={3.2} castShadow shadow-mapSize={[1024,1024]} shadow-bias={-.00005} shadow-normalBias={.008} shadow-camera-left={-1.5} shadow-camera-right={1.5} shadow-camera-top={1.5} shadow-camera-bottom={-1.5} />
        <directionalLight position={[-2,1,1.5]} intensity={1.3} />
        <MeasuredRobot assets={assets} frames={frames} cursor={cursor} config={config} playing={playing} renderTime={renderTime} />
        <CameraInteraction command={cameraCommand} />
      </Canvas>
    </SceneBoundary>}
    <div className="viewport-bottom"><span><Target size={15} /> {config.task==='pick_place'?'Physical contact pickup · placement target':'Pre-grasp goal · reach only'}</span><button className="viewport-button" onClick={resetCamera} aria-label="Reset camera"><ArrowCounterClockwise size={17} /> Reset camera</button></div>
    <div className="viewport-instructions">Drag / arrows to orbit · scroll / +/- to zoom <span>METERS / Z-UP</span></div>
  </div>;
}
export default memo(RobotView);
