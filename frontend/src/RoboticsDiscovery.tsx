import {useMemo,useState} from 'react';
import type {Branch,RobotFrame} from './domain';
import MathEquation from './MathEquation';
import {linearFit,type Point} from './roboticsFit';
type Metric='distance'|'object_x'|'object_y'|'object_z'|'hand_z';
const metrics:Record<Metric,string>={distance:'Hand distance to reference pose',object_x:'Object position X',object_y:'Object position Y',object_z:'Object height',hand_z:'Hand height'};
export default function RoboticsDiscovery({branch,trace}:{branch?:Branch;trace:RobotFrame[]}){
 const [metric,setMetric]=useState<Metric>('distance');
 const points=useMemo(()=>trace.map(frame=>{
  const object=frame.body_transforms.find(body=>body.name==='target')?.position;
  const value=metric==='distance'&&frame.target_pose?.position&&frame.end_effector?Math.hypot(...frame.end_effector.map((v,i)=>v-frame.target_pose.position[i])):
   metric==='hand_z'?frame.end_effector?.[2]:metric==='object_x'?object?.[0]:metric==='object_y'?object?.[1]:object?.[2];
  return typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(frame.time)?{time:frame.time,value}:null;
 }).filter((p):p is Point=>p!==null),[trace,metric]);
 const fit=useMemo(()=>linearFit(points),[points]);
 const plot=useMemo(()=>{
  if(points.length<2)return null;
  const t0=points[0].time,t1=points.at(-1)!.time,values=points.map(p=>p.value);if(fit)values.push(fit.predict(t0),fit.predict(t1));
  const low=Math.min(...values),high=Math.max(...values),span=Math.max(1e-6,high-low);
  const x=(t:number)=>20+280*(t-t0)/Math.max(1e-6,t1-t0),y=(v:number)=>85-65*(v-low)/span;
  const step=Math.max(1,Math.ceil(points.length/140));
  return {path:points.filter((_,i)=>i%step===0||i===points.length-1).map(p=>`${x(p.time)},${y(p.value)}`).join(' '),line:fit?`${x(t0)},${y(fit.predict(t0))} ${x(t1)},${y(fit.predict(t1))}`:null,t1,low,high};
 },[points,fit]);
 const num=(v:number)=>Number(v.toPrecision(4)).toString();
 const equation=fit?String.raw`\hat{y}(t) = ${num(fit.intercept)} ${fit.slope<0?'-':'+'} ${num(Math.abs(fit.slope))}\,(t-${num(fit.t0)})\quad\mathrm{m}`:'';
 return <section className="measured-graph" aria-labelledby="measured-graph-heading">
  <div className="graph-heading"><h3 id="measured-graph-heading">Physics graph</h3><span>{branch?(branch.evaluation.success?'SUCCESS':'FAILED'):'WAITING'}</span></div>
  <label className="graph-metric">Measurement <select value={metric} onChange={e=>setMetric(e.target.value as Metric)}>{Object.entries(metrics).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  {plot?<svg viewBox="0 0 320 110" role="img" aria-label={`${metrics[metric]}, ${points.length} measured samples in metres over time. Solid line is measured; dashed line is a linear fit.`}>
   <path className="graph-grid" d="M20 20H300M20 52H300M20 85H300"/><text x="20" y="13">{num(plot.high)} m</text><text x="20" y="98">{num(plot.low)} m</text><text x="300" y="106" textAnchor="end">{num(plot.t1)} s</text>
   <polyline points={plot.path} fill="none" stroke="#8bc7a4" strokeWidth="2" vectorEffect="non-scaling-stroke"/>{plot.line&&<polyline points={plot.line} fill="none" stroke="#e8bd7d" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>}
  </svg>:<p className="graph-empty">Run an experiment and select a recorded branch to see its measurements.</p>}
  {plot&&<details className="graph-equation"><summary>Equation and fit quality</summary>{fit?<><MathEquation latex={equation}/><p>Linear approximation fitted in this browser to {fit.trainCount} recorded MuJoCo samples. Held-out RMSE: {num(fit.rmse)} m across {fit.testCount} later samples. Dashed line is the fit; solid line is measured. This approximation is not a physical law.</p></>:<p>At least 10 time-varying samples are needed to fit an equation.</p>}</details>}
 </section>;
}
