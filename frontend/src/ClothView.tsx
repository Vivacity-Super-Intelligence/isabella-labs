import { useEffect,useMemo,useRef,useState,type RefObject } from 'react';
import { Canvas,useFrame,useThree } from '@react-three/fiber';
import { Line,OrbitControls } from '@react-three/drei';
import { BufferAttribute,BufferGeometry,DoubleSide,Group } from 'three';
import type { ClothFrame,Dict } from './domain';
import SceneBoundary from './SceneBoundary';

function Sheet({frames,cursor,time,playing,side}:{frames:ClothFrame[];cursor:RefObject<number>;time:number;playing:boolean;side:number}){
 const clamp=useRef<Group>(null);const {invalidate}=useThree();
 const geometry=useMemo(()=>{const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(frames[0].vertices.flat()),3));g.setIndex(frames[0].triangles.flat());g.computeVertexNormals();return g;},[frames]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>{invalidate();},[time,playing,frames,invalidate]);
 useFrame(()=>{const t=frames[0].time+cursor.current;let i=0;while(i<frames.length-2&&frames[i+1].time<t)i++;const a=frames[i],b=frames[Math.min(i+1,frames.length-1)],alpha=Math.max(0,Math.min(1,(t-a.time)/(b.time-a.time||1)));const p=geometry.getAttribute('position');a.vertices.forEach((v,j)=>p.setXYZ(j,...v.map((n,k)=>n+(b.vertices[j][k]-n)*alpha) as [number,number,number]));p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();clamp.current?.position.set(...a.clamp_position.map((n,k)=>n+(b.clamp_position[k]-n)*alpha) as [number,number,number]);(window as unknown as {__vivacityCloth:unknown}).__vivacityCloth={source:'measured_mujoco_flex_trace',time:t,vertices:Array.from(p.array),clampPosition:clamp.current?.position.toArray(),graspActive:a.grasp_active};if(playing)invalidate();});
 return <><mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color="#2455ff" side={DoubleSide} roughness={.9}/></mesh><mesh geometry={geometry}><meshBasicMaterial color="#101b47" wireframe transparent opacity={.18}/></mesh><group ref={clamp}><mesh castShadow><boxGeometry args={[.016,side+.02,.016]}/><meshStandardMaterial color="#787c7b" metalness={.5}/></mesh></group></>;
}
function Camera({command}:{command:{key:string;seq:number}}){
 const controls=useRef<any>(null);const {camera,invalidate}=useThree();
 useEffect(()=>{const c=controls.current;if(!c||!command.key)return;if(command.key==='ArrowLeft')c.setAzimuthalAngle(c.getAzimuthalAngle()-.14);if(command.key==='ArrowRight')c.setAzimuthalAngle(c.getAzimuthalAngle()+.14);if(command.key==='ArrowUp')c.setPolarAngle(Math.max(.1,c.getPolarAngle()-.14));if(command.key==='ArrowDown')c.setPolarAngle(Math.min(Math.PI-.1,c.getPolarAngle()+.14));if(['+','=','-'].includes(command.key))camera.position.sub(c.target).multiplyScalar(command.key==='-'?1.1:.9).add(c.target);c.update();invalidate();},[command,camera,invalidate]);
 return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={.3} maxDistance={3} target={[0,0,.04]}/>;
}
export default function ClothView({frames,cursor,time,playing,config}:{frames:ClothFrame[];cursor:RefObject<number>;time:number;playing:boolean;config:Dict}){
 const [cameraKey,setCameraKey]=useState(0),[command,setCommand]=useState({key:'',seq:0});const side=Number(config.side_length??.4);
 return <section className="cloth-viewport" aria-label="Measured deformable cloth" tabIndex={0} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)){e.preventDefault();setCommand(c=>({key:e.key,seq:c.seq+1}));}if(e.key.toLowerCase()==='r')setCameraKey(k=>k+1);}}>
  {frames.length?<SceneBoundary><Canvas key={cameraKey} frameloop="demand" shadows dpr={[1,1.25]} camera={{position:[.7,-.8,.9],fov:40,near:.01,far:20}} onCreated={({camera,gl})=>{camera.up.set(0,0,1);gl.setClearColor('#deddd4');}}><ambientLight intensity={1.2}/><directionalLight position={[1,-2,3]} intensity={3} castShadow/><mesh receiveShadow position={[0,0,-.025]}><boxGeometry args={[1,1,.05]}/><meshStandardMaterial color="#e5e3d9"/></mesh><Sheet frames={frames} cursor={cursor} time={time} playing={playing} side={side}/><Line points={[[0,-side/2,.014],[0,side/2,.014]]} color="#282c28" lineWidth={2}/><Camera command={command}/></Canvas></SceneBoundary>:<div className="viewport-loading">Initializing physical cloth…</div>}
  <p className="viewport-note">Fixed hinge · pre-attached clamps · real flex dynamics</p><button className="camera-reset" style={{color:'#202620'}} onClick={()=>setCameraKey(k=>k+1)} aria-label="Reset cloth camera">Reset view</button><p className="sr-only">Drag to orbit. Arrow keys orbit, plus and minus zoom, R resets. Motion interpolates recorded physical vertices.</p>
 </section>;
}
