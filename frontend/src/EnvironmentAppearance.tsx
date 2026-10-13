import {useEffect,useRef} from 'react';
import {useThree,useFrame} from '@react-three/fiber';
import {Box3,Vector3,PerspectiveCamera} from 'three';
import {SparkRenderer,SplatMesh,SplatFileType} from '@sparkjsdev/spark';
import {API} from './api';
import {workspaceToken,type LibraryWorld} from './workspaceApi';
import EmbeddedGltf from './EmbeddedGltf';
import warehouseProvenance from '../public/environments/warehouse/provenance.json';

export type Appearance={format:'spz'|'glb';url?:string;quality?:string;semantics?:{metric_scale_factor:number;ground_plane_offset:number}|null;metric_scale_verified?:boolean;coordinate_system?:string;visual_scale?:number;visual_ground_y?:number};
// Curated calibration for this older export, whose provider omitted metric metadata.
export const laboratoryAppearance:Appearance={format:'spz',url:'/environments/laboratory/world.spz',quality:'500k',semantics:null,metric_scale_verified:false,coordinate_system:'marble_export_y_up',visual_scale:2.5,visual_ground_y:-.756103516};
export function appearanceFor(world?:LibraryWorld):Appearance|null{
  if(world?.appearance)return world.appearance as Appearance;
  if(world?.id==='warehouse')return {...warehouseProvenance.appearance,url:'/environments/warehouse/world.spz'} as Appearance;
  return world?.id==='robotics_lab'?laboratoryAppearance:null;
}

function SparkEngine({onStatus}:{onStatus:(message:string,error?:boolean)=>void}){
  const {gl,scene,invalidate,camera}=useThree();
  const state=useRef<{spark:SparkRenderer;active:boolean;pending:Promise<void>|null;signature:string}|null>(null);
  const status=useRef(onStatus);status.current=onStatus;
  useEffect(()=>{
    const spark=new SparkRenderer({renderer:gl,autoUpdate:false,minSortIntervalMs:0,maxPixelRadius:128,onDirty:()=>state.current?.active&&invalidate()});
    const current={spark,active:true,pending:null as Promise<void>|null,signature:''};state.current=current;scene.add(spark);
    return()=>{
      current.active=false;scene.remove(spark);state.current=null;
      // Spark's synchronous dispose invalidates GPU readback targets. Complete
      // the owned update before releasing those targets and its worker.
      if(current.pending)void current.pending.finally(()=>spark.dispose());else spark.dispose();
    };
  },[gl,scene,invalidate]);
  useFrame(()=>{
    const current=state.current;if(!current?.active||current.pending)return;
    const keys=[...camera.position.toArray(),...camera.quaternion.toArray(),(camera as PerspectiveCamera).zoom,...camera.projectionMatrix.elements];
    const splats:string[]=[];scene.traverse(o=>{if(o instanceof SplatMesh&&o.isInitialized)splats.push(o.uuid+':'+o.numSplats+':'+o.position.toArray()+':'+o.scale.toArray()+':'+o.quaternion.toArray());});
    const signature=keys.join(',')+'|'+splats.join('|');if(signature===current.signature)return;current.signature=signature;
    if(!splats.length){current.spark.clearSplats();invalidate();return;}
    current.pending=current.spark.update({scene,camera}).catch(e=>{if(current.active)status.current('Environment rendering failed: '+e.message,true);}).finally(()=>{current.pending=null;if(current.active)invalidate();});
  },-2);
  return null;
}

/** Color, opacity, covariance and spherical harmonics remain in the original SPZ.
 * MuJoCo collision geometry is intentionally not derived from visible splats. */
function Splats({world,appearance,onStatus,onBounds}:{world?:LibraryWorld;appearance:Appearance;onStatus:(message:string,error?:boolean)=>void;onBounds?:(bounds:Box3)=>void}){
  const {gl,scene,invalidate}=useThree();
  useEffect(()=>{
    let active=true,mesh:SplatMesh|undefined;
    const abort=new AbortController();
    onStatus('Loading environment appearance…');
    const load=async()=>{
      const url=appearance.url??`${API}/v1/workspace/worlds/${encodeURIComponent(world!.id)}/appearance`;
      const response=await fetch(url,{signal:abort.signal,headers:appearance.url?{}:{'X-Workspace-Token':workspaceToken()}});
      if(!response.ok)throw new Error(`Environment asset could not load (${response.status}).`);
      const bytes=await response.arrayBuffer();if(!active)return;
      mesh=new SplatMesh({fileBytes:bytes,fileType:SplatFileType.SPZ,raycastable:false,lod:false});
      await mesh.initialized;if(!active){mesh.dispose();return;}
      const semantics=appearance.semantics;
      const rawBounds=mesh.getBoundingBox();
      const legacy=!semantics;
      const scale=semantics?.metric_scale_factor??appearance.visual_scale??3.2/Math.max(.1,rawBounds.max.y-rawBounds.min.y);
      mesh.scale.setScalar(scale);
      // Marble raw OpenCV -> Three Y-up (180 X) -> runtime Z-up (90 X).
      mesh.rotation.x=legacy?Math.PI/2:-Math.PI/2;
      mesh.position.z=legacy?-.8-(appearance.visual_ground_y??rawBounds.min.y)*scale:-.8+semantics.ground_plane_offset;
      mesh.updateMatrixWorld(true);scene.add(mesh);
      const bounds=mesh.getBoundingBox().applyMatrix4(mesh.matrixWorld);
      if(!Number.isFinite(bounds.getSize(new Vector3()).length()))throw new Error('Environment has invalid bounds.');
      onBounds?.(bounds);onStatus('');invalidate();
    };
    load().catch(e=>{if(active&&e.name!=='AbortError')onStatus(e.message||'Environment rendering failed.',true);});
    return()=>{active=false;abort.abort();if(mesh){scene.remove(mesh);if(mesh.isInitialized)mesh.dispose();}invalidate();};
  },[gl,scene,invalidate,world?.id,appearance.url]);
  return <SparkEngine onStatus={onStatus}/>;
}

export default function EnvironmentAppearance(props:{world?:LibraryWorld;appearance:Appearance;onStatus:(message:string,error?:boolean)=>void;onBounds?:(bounds:Box3)=>void}){
  return props.appearance.format==='glb'&&props.world?<EmbeddedGltf world={props.world} onStatus={props.onStatus} onBounds={props.onBounds}/>:<Splats {...props}/>;
}
