import {useEffect,useMemo,useState} from 'react';
import {Pause,Play} from '@phosphor-icons/react';
import type {components} from './generated/api';

type Qualification=components['schemas']['RobotQualification'];

export default function RobotQualificationTrace({report}:{report:Qualification}){
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false);
 const frame=report.frames[Math.min(index,Math.max(0,report.frames.length-1))];
 useEffect(()=>{if(!playing||report.frames.length<2)return;const timer=window.setInterval(()=>setIndex(value=>{if(value+1>=report.frames.length){setPlaying(false);return value;}return value+1;}),90);return()=>window.clearInterval(timer);},[playing,report.frames.length]);
 const projected=useMemo(()=>{const all=report.frames.flatMap(item=>item.positions_m.map(([x,y,z])=>[x+.35*y,z-.18*y]));const xs=all.map(v=>v[0]),ys=all.map(v=>v[1]);const minX=Math.min(...xs,0),maxX=Math.max(...xs,1),minY=Math.min(...ys,0),maxY=Math.max(...ys,1);const span=Math.max(maxX-minX,maxY-minY,.2);return (frame?.positions_m??[]).map(([x,y,z])=>[28+(x+.35*y-minX)/span*544,292-(z-.18*y-minY)/span*250]);},[frame,report.frames]);
 if(!frame)return <div className="qualification-trace"><p>No motion frames were recorded.</p></div>;
 return <section className="qualification-trace" aria-labelledby="qualification-trace-title">
  <div className="qualification-trace-heading"><div><span className={`qualification-verdict ${report.verdict==='failed'?'failed':'passed'}`}>{report.verdict.replaceAll('_',' ')}</span><h2 id="qualification-trace-title">Measured MuJoCo motion</h2></div><span className="mono">{frame.phase.replaceAll('_',' ')} · {frame.time_s.toFixed(3)} s</span></div>
  <svg viewBox="0 0 600 320" role="img" aria-label={`Recorded robot body positions during ${frame.phase.replaceAll('_',' ')}`}>
   <path className="trace-floor" d="M22 296H578"/>
   {projected.map((point,bodyIndex)=>{const parent=report.body_parent_indices[bodyIndex];if(parent<0||!projected[parent])return null;return <line key={`link-${bodyIndex}`} x1={projected[parent][0]} y1={projected[parent][1]} x2={point[0]} y2={point[1]} className="trace-link"/>;})}
   {projected.map((point,bodyIndex)=><g key={report.body_names[bodyIndex]??bodyIndex}><circle cx={point[0]} cy={point[1]} r={bodyIndex===projected.length-1?6:4} className="trace-body"/><title>{report.body_names[bodyIndex]??`body ${bodyIndex}`}</title></g>)}
  </svg>
  <div className="qualification-playback"><button className="secondary" onClick={()=>{if(index>=report.frames.length-1)setIndex(0);setPlaying(value=>!value);}} aria-label={playing?'Pause measured trace':'Play measured trace'}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause':'Play trace'}</button><input aria-label="Recorded frame" type="range" min={0} max={Math.max(0,report.frames.length-1)} value={index} onChange={event=>{setPlaying(false);setIndex(Number(event.target.value));}}/><span className="mono">{index+1}/{report.frames.length}</span></div>
  <p className="small">Each point is a submitted body origin from an authoritative recorded physics frame. Lines follow the submitted body hierarchy; this diagnostic skeleton does not invent missing visual geometry.</p>
 </section>;
}
