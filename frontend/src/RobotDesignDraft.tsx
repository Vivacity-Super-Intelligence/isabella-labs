import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {errorMessage} from './api';
import {vivaAgentApi,type RobotDesign} from './vivaAgentApi';

export default function RobotDesignDraft({id}:{id:string}){
 const [record,setRecord]=useState<RobotDesign|null>(null),[lengths,setLengths]=useState<number[]>([]),[masses,setMasses]=useState<number[]>([]);
 const [radius,setRadius]=useState(.035),[torque,setTorque]=useState(35),[opening,setOpening]=useState(.08);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;vivaAgentApi.robotDesign(id).then(value=>{if(active){setRecord(value);setLengths(value.spec.link_lengths_m);setMasses(value.spec.link_masses_kg);setRadius(value.spec.link_radius_m);setTorque(value.spec.torque_limit_nm);setOpening(value.spec.gripper_opening_m);}}).catch(cause=>{if(active)setError(errorMessage(cause));});return()=>{active=false;};},[id]);
 const points=useMemo(()=>{
  const angles=[-Math.PI/2,-.45,-.16,.1,.3,.45];let x=38,y=162;
  return [[x,y],...lengths.map((length,index)=>{x+=length*165*Math.cos(angles[index]);y+=length*165*Math.sin(angles[index]);return [x,y];})];
 },[lengths]);
 const adjust=(values:number[],index:number,value:number,set:(next:number[])=>void)=>set(values.map((entry,i)=>i===index?value:entry));
 const save=async(event:FormEvent)=>{
  event.preventDefault();if(!record)return;setBusy(true);setError('');
  try{
   const next=await vivaAgentApi.createRobotDesign(record.description,{...record.spec,link_lengths_m:lengths,link_masses_kg:masses,
    link_radius_m:radius,torque_limit_nm:torque,gripper_opening_m:opening});
   setRecord(next);
  }catch(cause){setError(errorMessage(cause));}finally{setBusy(false);}
 };
 return <details className="viva-designer"><summary>Six-axis design draft {record?'· MuJoCo compiled':''}</summary>
  {error&&<p role="alert" className="viva-error">{error}</p>}
  {record&&<><p className="viva-draft-warning">Draft only. A sorting controller, reachability and collision acceptance are still required before this arm can run experiments.</p>
   <svg viewBox="0 0 310 184" role="img" aria-label="Schematic of six robot links using the entered lengths. Joint pose is illustrative, not a simulation result.">
    <rect x="15" y="165" width="45" height="11" fill="#819d98"/>
    {points.slice(1).map((point,index)=><g key={index}><line x1={points[index][0]} y1={points[index][1]} x2={point[0]} y2={point[1]} stroke={index%2?'#b9d3c7':'#dce8d9'} strokeWidth={Math.max(3,radius*90)} strokeLinecap="round"/><circle cx={point[0]} cy={point[1]} r="4" fill="#13292a" stroke="#a8dfd0"/></g>)}
   </svg>
   <form onSubmit={save}><div className="viva-design-grid">{lengths.map((length,index)=><label key={`length-${index}`}>Link {index+1} length · m<input type="number" min="0.06" max="0.45" step="0.01" value={length} onChange={event=>adjust(lengths,index,Number(event.target.value),setLengths)}/></label>)}
    {masses.map((mass,index)=><label key={`mass-${index}`}>Link {index+1} mass · kg<input type="number" min="0.1" max="6" step="0.1" value={mass} onChange={event=>adjust(masses,index,Number(event.target.value),setMasses)}/></label>)}
    <label>Link radius · m<input type="number" min="0.018" max="0.06" step="0.001" value={radius} onChange={event=>setRadius(Number(event.target.value))}/></label>
    <label>Motor torque limit · N·m<input type="number" min="5" max="100" step="1" value={torque} onChange={event=>setTorque(Number(event.target.value))}/></label>
    <label>Gripper opening · m<input type="number" min="0.04" max="0.12" step="0.005" value={opening} onChange={event=>setOpening(Number(event.target.value))}/></label></div>
    <button type="submit" disabled={busy}>{busy?'Compiling in MuJoCo…':'Validate new draft'}</button>
    <button type="button" disabled={busy} onClick={()=>void vivaAgentApi.downloadRobotDesign(record.id).catch(cause=>setError(errorMessage(cause)))}>Download MJCF</button>
   </form><p className="viva-design-hash">Model SHA-256 {record.model_sha256.slice(0,16)}… · {record.model_joint_count} joints · {record.model_actuator_count} actuators</p></>}
 </details>;
}
