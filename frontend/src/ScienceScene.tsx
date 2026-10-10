import { useEffect,useMemo,useRef,type RefObject } from 'react';
import { Canvas,useFrame,useThree } from '@react-three/fiber';
import { Line,OrbitControls } from '@react-three/drei';
import { Mesh,BufferAttribute,BufferGeometry } from 'three';
import type { Branch,ScienceFrame,ScienceObservation,Vec3 } from './domain';

function positionAt(frames:ScienceFrame[],time:number,key:'predicted_position'|'observed_position'):Vec3{
 let i=0;while(i<frames.length-2&&frames[i+1].time<time)i++;
 const a=frames[i],b=frames[Math.min(i+1,frames.length-1)];
 if(!a)return [0,0,0];const alpha=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time||1)));
 return [a[key][0]+(b[key][0]-a[key][0])*alpha,a[key][1]+(b[key][1]-a[key][1])*alpha,0];
}
function Motion({frames,cursor,time,playing}:{frames:ScienceFrame[];cursor?:RefObject<number>;time:number;playing:boolean}){
 const predicted=useRef<Mesh>(null),observed=useRef<Mesh>(null);const {invalidate}=useThree();
 const geometry=useMemo(()=>{const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(6),3));return g;},[]);
 useEffect(()=>{invalidate();},[time,frames,playing,invalidate]);useEffect(()=>()=>geometry.dispose(),[geometry]);
 useFrame(()=>{const t=cursor?.current??time,p=positionAt(frames,t,'predicted_position'),o=positionAt(frames,t,'observed_position');predicted.current?.position.set(...p);observed.current?.position.set(...o);const attribute=geometry.getAttribute('position');attribute.setXYZ(0,...p);attribute.setXYZ(1,...o);attribute.needsUpdate=true;geometry.computeBoundingSphere();(window as unknown as {__vivacityScience:unknown}).__vivacityScience={source:'computed_scipy_plane',time:t,predictedPosition:p,observedPosition:o,plane:'z=0'};if(playing)invalidate();});
 return <><mesh ref={predicted}><sphereGeometry args={[.035,16,12]}/><meshStandardMaterial color="#2455ff"/></mesh><mesh ref={observed}><sphereGeometry args={[.028,12,8]}/><meshStandardMaterial color="#3b3f39"/></mesh><lineSegments geometry={geometry}><lineBasicMaterial color="#c64928"/></lineSegments></>;
}
function Camera({command}:{command:{key:string;seq:number}}){
 const controls=useRef<any>(null);const {camera,invalidate}=useThree();
 useEffect(()=>{const c=controls.current;if(!c||!command.key)return;if(command.key==='ArrowLeft')c.setAzimuthalAngle(c.getAzimuthalAngle()-.14);if(command.key==='ArrowRight')c.setAzimuthalAngle(c.getAzimuthalAngle()+.14);if(command.key==='ArrowUp')c.setPolarAngle(Math.max(.1,c.getPolarAngle()-.14));if(command.key==='ArrowDown')c.setPolarAngle(Math.min(Math.PI-.1,c.getPolarAngle()+.14));if(['+','=','-'].includes(command.key))camera.position.sub(c.target).multiplyScalar(command.key==='-'?1.1:.9).add(c.target);c.update();invalidate();},[command,camera,invalidate]);
 return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={.6} maxDistance={20} target={[0,0,0]}/>;
}
export default function ScienceScene({observation,fits,selected,time,cursor,playing,influence,cameraKey,command}:{observation:ScienceObservation|null;fits:Branch[];selected:string|null;time:number;cursor?:RefObject<number>;playing:boolean;influence:boolean;cameraKey:number;command:{key:string;seq:number}}){
 const points=observation?.observations??[];
 const paths=useMemo(()=>fits.map(b=>({id:b.id,frames:b.trace as ScienceFrame[],points:(b.trace as ScienceFrame[]).map(f=>[f.predicted_position[0],f.predicted_position[1],0] as Vec3),extra:b.evaluation.hypothesis!=='central_only'})),[fits]);
 const chosen=paths.find(p=>p.id===selected)??paths[0];
 const location=observation?.config.perturbing_position as number[]|undefined;
 const split=fits[0]?.evaluation.train_count??Math.floor(points.length*Number(observation?.config.train_fraction??.7));
 const extent=Math.max(1.5,...points.flat().map(Math.abs),...(influence&&location?location.map(Math.abs):[]));
 return <Canvas key={cameraKey} frameloop="demand" dpr={[1,1.25]} camera={{position:[extent*1.1,-extent*2.5,extent*1.8],fov:40,near:.01,far:100}} gl={{antialias:true,preserveDrawingBuffer:true}} onCreated={({camera,gl})=>{camera.up.set(0,0,1);gl.setClearColor('#deddd4');}}>
   <ambientLight intensity={1.3}/><directionalLight position={[1,-3,5]} intensity={2.2}/>
   <gridHelper args={[extent*4,20,'#b6b6ad','#cdcdc3']} rotation={[Math.PI/2,0,0]} position={[0,0,-.008]}/>
   <mesh><sphereGeometry args={[.075,24,16]}/><meshStandardMaterial color="#dca24c" emissive="#724012" emissiveIntensity={.4}/></mesh>
   {paths.map(p=><Line key={p.id} points={p.points} color={p.extra?'#2455ff':'#9b6149'} lineWidth={p.id===selected?2:1.2} dashed={!p.extra} dashSize={.04} gapSize={.025}/>)}
   {points.map((p,i)=><mesh key={i} position={[p[0],p[1],0]}><sphereGeometry args={[i<split?.014:.022,8,6]}/><meshBasicMaterial color={i<split?'#4a4e47':'#232821'} wireframe={i>=split}/></mesh>)}
   {influence&&location&&fits.some(b=>b.evaluation.hypothesis==='central_plus_fixed_perturber')&&<mesh position={[location[0],location[1],0]}><sphereGeometry args={[.065,16,12]}/><meshBasicMaterial color="#2455ff" wireframe/></mesh>}
   {chosen&&<Motion frames={chosen.frames} cursor={cursor} time={time} playing={playing}/>}
   <Camera command={command}/>
 </Canvas>;
}
