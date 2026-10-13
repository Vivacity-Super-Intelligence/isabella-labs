import {useEffect,useMemo,useState,useRef} from 'react';
import {Canvas} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {BufferAttribute,BufferGeometry,DoubleSide,Spherical,Vector3} from 'three';
import {useThree} from '@react-three/fiber';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import type {LibraryWorld} from './workspaceApi';
import {workspaceApi} from './workspaceApi';
import type {components} from './generated/api';
import SceneBoundary from './SceneBoundary';

export function ImportedVisual({preview,mapping}:{preview:components['schemas']['ImportPreview'];mapping:Record<string,unknown>}){
  const geometry=useMemo(()=>{
    const scale=Number(mapping.scale??1),center=mapping.original_center_m as number[]??[0,0,0];
    const positions=preview.positions.flatMap(p=>{
      const converted=mapping.up_axis==='z'?p:[p[0],-p[2],p[1]];
      return converted.map((v,i)=>v*scale-center[i]);
    });
    const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));g.setIndex(preview.indices);g.computeVertexNormals();return g;
  },[preview,mapping]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const pos=mapping.position_m as [number,number,number]??[2.5,2.5,.5];
  return <mesh geometry={geometry} position={pos}><meshStandardMaterial color="#8a9995" side={DoubleSide} roughness={.8}/></mesh>;
}

function PreviewControls(){
  const controls=useRef<OrbitControlsImpl>(null);const {camera,gl,invalidate}=useThree();
  useEffect(()=>{const canvas=gl.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Environment preview. Arrow keys orbit, plus and minus zoom, R resets.');
    const key=(e:KeyboardEvent)=>{const c=controls.current;if(!c||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','r','R'].includes(e.key))return;e.preventDefault();
      if(e.key.toLowerCase()==='r'){camera.position.set(4,-5,3.5);c.target.set(.4,0,0);}else{const offset=new Vector3().copy(camera.position).sub(c.target);offset.applyQuaternion(camera.quaternion.clone().setFromUnitVectors(camera.up,new Vector3(0,1,0)));const s=new Spherical().setFromVector3(offset);
        if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi-=.12;if(e.key==='ArrowDown')s.phi+=.12;if(e.key==='+'||e.key==='=')s.radius*=.9;if(e.key==='-')s.radius*=1.1;s.makeSafe();offset.setFromSpherical(s).applyQuaternion(camera.quaternion.clone().setFromUnitVectors(new Vector3(0,1,0),camera.up));camera.position.copy(c.target).add(offset);}
      c.update();invalidate();};canvas.addEventListener('keydown',key);return()=>canvas.removeEventListener('keydown',key);},[camera,gl,invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} target={[.4,0,0]}/>;
}

export default function WorldPreview({world}:{world:LibraryWorld}){
  const [preview,setPreview]=useState<components['schemas']['ImportPreview']|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;setPreview(null);setError(null);if(world.preview_available)workspaceApi.preview(world.id).then(p=>active&&setPreview(p)).catch(()=>active&&setError('Original geometry preview could not load. The collision specification remains available.'));return()=>{active=false;};},[world.id]);
  return <><div className="world-preview" aria-label={`${world.name}: static scene preview, not an executed experiment`}><SceneBoundary><Canvas frameloop="demand" dpr={[1,1.25]} camera={{position:[4,-5,3.5],near:.01,far:40,fov:44}} onCreated={({camera,gl})=>{camera.up.set(0,0,1);gl.setClearColor('#deddd4');}}>
    <ambientLight intensity={world.spec.lighting.ambient}/><directionalLight position={[2,-2,6]} intensity={world.spec.lighting.key_intensity}/>
    <mesh position={[.4,0,-.04]}><boxGeometry args={[1.4,1.3,.08]}/><meshStandardMaterial color="#b9ae95"/></mesh>
    {world.spec.geometries.filter(g=>!preview||g.name!=='import_collision_proxy').map(g=><mesh key={g.name} position={g.position as [number,number,number]} rotation={g.type==='cylinder'?[Math.PI/2,0,0]:undefined}>{g.type==='box'?<boxGeometry args={g.size.map(v=>v*2) as [number,number,number]}/>:<cylinderGeometry args={[g.size[0],g.size[0],g.size[1]*2,24]}/>}<meshStandardMaterial color={`rgb(${g.rgba.slice(0,3).map(v=>Math.round(v*255)).join(',')})`}/></mesh>)}
    {preview&&world.mapping&&<ImportedVisual preview={preview} mapping={world.mapping}/>}<PreviewControls/>
  </Canvas></SceneBoundary></div><p className="small">Static geometry preview. Drag to orbit or focus the preview and use arrow keys, +/− to zoom, R to reset. Loading an environment initializes physics; it does not start an experiment.</p>{error&&<p role="alert" className="negative">{error}</p>}</>;
}
