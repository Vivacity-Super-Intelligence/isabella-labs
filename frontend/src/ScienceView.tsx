import { useMemo, useState } from 'react';
import type { Branch, ScienceObservation } from './domain';
import { format } from './domain';

export default function ScienceView({ observation, branches, selected, time }: { observation: ScienceObservation | null; branches: Branch[]; selected: string | null; time:number }) {
  const [showInfluence,setShowInfluence] = useState(false);
  // A lab switch can briefly retain the previous adapter's evidence while the
  // replacement world loads. Keep the chart domain-specific during that handoff.
  const fits = branches.filter(b=>b.evaluation.success && b.trace.length && 'predicted_position' in b.trace[0]);
  const points = observation?.observations ?? [];
  const trainCount = fits[0]?.evaluation.train_count ?? Math.floor(points.length*Number(observation?.config.train_fraction ?? .7));
  const all = [...points,...fits.flatMap(b=>b.trace.map(f=>(f as {predicted_position:number[]}).predicted_position))];
  const location = observation?.config.perturbing_position as number[] | undefined;
  const extent = Math.max(1.25,...all.flat().map(Math.abs),...(showInfluence&&location?location.map(Math.abs):[]));
  const origin = [350,230], scale = 175/extent;
  const xy = (point: number[]) => [origin[0]+point[0]*scale,origin[1]-point[1]*scale];
  const path = (data: number[][]) => data.map((p,i)=>`${i?'L':'M'}${xy(p).join(',')}`).join(' ');
  const extra = fits.find(b=>b.evaluation.hypothesis==='central_plus_fixed_perturber');
  const selectedFit=fits.find(b=>b.id===selected)??fits[0];
  const temporal=selectedFit?.trace.reduce((best,frame)=>Math.abs(frame.time-time)<Math.abs(best.time-time)?frame:best,selectedFit.trace[0]);
  const errors = useMemo(()=>fits.map(b=>({ branch:b, errors:(b.evaluation.residuals ?? []).map(r=>Math.hypot(...r)) })),[branches]);
  const errorMax = Math.max(.001,...errors.flatMap(e=>e.errors));
  return <div className="science-viewport" data-testid="science-viewport">
    <div className="science-header"><span className="mono">02 / THE INVISIBLE PLANET</span><span>Restricted 2D orbital model</span></div>
    <svg className="orbit-chart" viewBox="0 0 700 470" role="img" aria-label="Observed orbital positions, training and held-out samples, and numerically fitted model predictions">
      <defs><pattern id="orbital-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M 35 0 L 0 0 0 35" fill="none" stroke="#d5d4ca" strokeWidth=".6" /></pattern></defs>
      <rect width="700" height="470" fill="url(#orbital-grid)" />
      <line x1="0" y1={origin[1]} x2="700" y2={origin[1]} stroke="#b2b2a8" /><line x1={origin[0]} y1="0" x2={origin[0]} y2="470" stroke="#b2b2a8" />
      <circle cx={origin[0]} cy={origin[1]} r="11" fill="#151715" /><circle cx={origin[0]} cy={origin[1]} r="20" fill="none" stroke="#85877d" strokeWidth=".8" />
      <text x={origin[0]+28} y={origin[1]+5} className="chart-label">CENTRAL BODY</text>
      {fits.map((b,i)=><path key={b.id} d={path(b.trace.map(f=>(f as {predicted_position:number[]}).predicted_position))} fill="none" stroke={i===0?'#9b6149':'#2455ff'} strokeWidth={selected===b.id?2.5:1.6} strokeDasharray={i===0?'6 5':undefined} />)}
      {points.map((p,i)=><circle key={i} cx={xy(p)[0]} cy={xy(p)[1]} r={i<trainCount?2.4:3.2} fill={i<trainCount?'#3c403b':'#deddd4'} stroke={i<trainCount?'#3c403b':'#3c403b'} strokeWidth="1.2" />)}
      {temporal&&<circle data-testid="scientific-time-marker" cx={xy((temporal as {predicted_position:number[]}).predicted_position)[0]} cy={xy((temporal as {predicted_position:number[]}).predicted_position)[1]} r="7" fill="none" stroke="#2455ff" strokeWidth="2" />}
      {showInfluence && extra && location && <g><circle cx={xy(location)[0]} cy={xy(location)[1]} r="9" fill="none" stroke="#2455ff" strokeWidth="2" /><text x={xy(location)[0]-22} y={xy(location)[1]-16} className="chart-label">FITTED INFLUENCE</text></g>}
      <text x="16" y="455" className="chart-label">x, y / NONDIMENSIONAL</text>
      {!points.length && <text x="350" y="100" textAnchor="middle" className="chart-label">Waiting for numerical observations</text>}
    </svg>
    <div className="chart-legend"><span><i className="legend-dot" /> Training observations</span><span><i className="legend-dot hollow" /> Held-out observations</span><span><i className="legend-line baseline" /> Central only</span><span><i className="legend-line" /> Additional influence</span></div>
    <div className="residual-heading"><span className="mono">PREDICTION RESIDUALS</span><span>{fits.length ? 'Distance from observed positions' : 'Available after fitting'}</span></div>
    <svg className="residual-chart" viewBox="0 0 700 110" role="img" aria-label="Residual magnitude for each numerically fitted model; shaded right region is held-out observations">
      <rect x={20+660*trainCount/Math.max(points.length,1)} y="4" width={660*(1-trainCount/Math.max(points.length,1))} height="85" fill="#cdcfc4" />
      <line x1="20" y1="89" x2="680" y2="89" stroke="#aaa99e" />
      {errors.map((e,i)=><path key={e.branch.id} d={e.errors.map((v,k)=>`${k?'L':'M'}${20+660*k/Math.max(1,e.errors.length-1)},${89-75*v/errorMax}`).join(' ')} fill="none" stroke={i===0?'#9b6149':'#2455ff'} strokeWidth="1.8" />)}
      <text x="20" y="106" className="chart-label">t = 0</text><text x="572" y="106" className="chart-label">HELD-OUT</text>
    </svg>
    <div className="science-footnote"><span>Observations + solve_ivp predictions. No hidden truth is returned.</span><label><input type="checkbox" checked={showInfluence} disabled={!extra} onChange={e=>setShowInfluence(e.target.checked)} /> Show fitted influence</label></div>
    {extra && showInfluence && <p className="inferred-note">Fitted mass: {format(extra.evaluation.parameters?.perturbing_mass,5)}. Location is an assumption supplied to both models; this marker is not hidden ground truth.</p>}
  </div>;
}
