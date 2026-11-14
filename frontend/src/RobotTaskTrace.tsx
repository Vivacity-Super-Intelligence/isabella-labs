import {useEffect,useMemo,useState} from 'react';
import {Pause,Play} from '@phosphor-icons/react';
import type {components} from './generated/api';

type Trial=components['schemas']['RobotTaskTrial'];

export default function RobotTaskTrace({trial}:{trial:Trial}){
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false);
 const frame=trial.frames[Math.min(index,Math.max(0,trial.frames.length-1))];
 useEffect(()=>{setIndex(0);setPlaying(false);},[trial.id]);
 useEffect(()=>{if(!playing||trial.frames.length<2)return;const timer=window.setInterval(()=>setIndex(value=>{if(value+1>=trial.frames.length){setPlaying(false);return value;}return value+1;}),90);return()=>window.clearInterval(timer);},[playing,trial.frames.length]);
 useEffect(()=>{(window as unknown as {__vivacityTaskTrial?:unknown}).__vivacityTaskTrial={id:trial.id,status:trial.status,task:trial.task,frames:trial.frames.length,source:'measured_mujoco'};},[trial]);
 const projection=useMemo(()=>{
  const destination=trial.effective_config.destination_position_m;
  const all=trial.frames.flatMap(item=>[...item.positions_m,...(item.object_position_m?[item.object_position_m]:[])]).concat([destination]);
  const transformed=all.map(([x,y,z])=>[x+.28*y,z-.12*y]);
  const xs=transformed.map(v=>v[0]),ys=transformed.map(v=>v[1]);
  const minX=Math.min(...xs,-.2),maxX=Math.max(...xs,.8),minY=Math.min(...ys,0),maxY=Math.max(...ys,.8);
  const span=Math.max(maxX-minX,maxY-minY,.4);
  const project=([x,y,z]:number[])=>[34+(x+.28*y-minX)/span*532,286-(z-.12*y-minY)/span*238];
  return {project,points:(frame?.positions_m??[]).map(project),destination:project(destination),object:frame?.object_position_m?project(frame.object_position_m):null};
 },[frame,trial.effective_config.destination_position_m,trial.frames]);
 if(!frame)return <section className="task-trace"><h2>No measured task frames</h2><p>The worker returned no replayable state.</p></section>;
 const metric=(key:string,unit='')=>typeof trial.measurements[key]==='number'?`${Number(trial.measurements[key]).toFixed(3)}${unit}`:'Not measured';
 return <section className="task-trace" aria-labelledby="task-trace-title">
  <header><div><span className={`qualification-verdict ${trial.status==='succeeded'?'passed':'failed'}`}>{trial.status}</span><h2 id="task-trace-title">Configured MuJoCo task</h2></div><span className="mono">{frame.phase.replaceAll('_',' ')}, {frame.time_s.toFixed(3)} s</span></header>
  <svg viewBox="0 0 600 320" role="img" aria-label={`Measured robot and object positions during ${frame.phase.replaceAll('_',' ')}`}>
   <path className="trace-floor" d="M22 292H578"/>
   {trial.effective_config.environment==='tabletop'&&<path className="trace-fixture" d="M292 220H520M310 220V292M502 220V292"/>}
   {projection.points.map((point,bodyIndex)=>{const parent=trial.body_parent_indices[bodyIndex];if(parent<0||!projection.points[parent])return null;return <line key={`link-${bodyIndex}`} x1={projection.points[parent][0]} y1={projection.points[parent][1]} x2={point[0]} y2={point[1]} className="trace-link"/>;})}
   {projection.points.map((point,bodyIndex)=><g key={trial.body_names[bodyIndex]??bodyIndex}><circle cx={point[0]} cy={point[1]} r={bodyIndex===projection.points.length-1?6:4} className="trace-body"/><title>{trial.body_names[bodyIndex]??`body ${bodyIndex}`}</title></g>)}
   <rect x={projection.destination[0]-7} y={projection.destination[1]-4} width="14" height="8" className="trace-destination"><title>Configured destination</title></rect>
   {projection.object&&<rect x={projection.object[0]-6} y={projection.object[1]-6} width="12" height="12" className="trace-object"><title>Measured object position</title></rect>}
  </svg>
  <div className="trace-legend" aria-label="Task trace legend"><span><i className="object"/>Measured object</span><span><i className="destination"/>Destination</span><span><i className="robot"/>Submitted robot bodies</span></div>
  <div className="qualification-playback"><button className="secondary" onClick={()=>{if(index>=trial.frames.length-1)setIndex(0);setPlaying(value=>!value);}} aria-label={playing?'Pause measured task':'Play measured task'}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause':'Play trial'}</button><input aria-label="Recorded task frame" type="range" min={0} max={Math.max(0,trial.frames.length-1)} value={index} onChange={event=>{setPlaying(false);setIndex(Number(event.target.value));}}/><span className="mono">{index+1}/{trial.frames.length}</span></div>
  <dl className="task-measurements"><div><dt>Physics steps</dt><dd>{String(trial.measurements.physics_steps??0)}</dd></div><div><dt>Goal error</dt><dd>{metric(trial.task==='pick_place'?'placement_error_m':'goal_error_m',' m')}</dd></div><div><dt>Grip force</dt><dd>{metric('peak_grip_force_n',' N')}</dd></div></dl>
  <p className="small">{trial.scope}</p>
 </section>;
}
