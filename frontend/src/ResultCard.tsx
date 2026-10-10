import { DownloadSimple } from '@phosphor-icons/react';
import { format,type Branch } from './domain';

export default function ResultCard({branch:b,rank:i,selected,robotics,choose,download}:{branch:Branch;rank:number;selected:boolean;robotics:boolean;choose:()=>void;download:()=>void}){
  return <article className={`result-card ${selected?'selected':''}`}>
    <div className="result-top"><span className="rank mono">#{i+1} {i===0?'Best':'Alternative'}</span><button className="icon-button" aria-label={`Download JSON for result ${i+1}`} title="Download actual recorded evidence" onClick={download}><DownloadSimple size={16}/></button></div>
    <button className="result-select" aria-pressed={selected} data-testid="branch-row" data-status={b.evaluation.status} onClick={choose}><strong>{robotics?'Collision-free reach':b.evaluation.hypothesis==='central_only'?'Central body only':'Additional influence'}</strong></button>
    <dl>{robotics?<><div><dt>Reach verified</dt><dd>Yes</dd></div><div><dt>Execution</dt><dd>{format(b.evaluation.execution_duration_s,2)} s</dd></div><div><dt>Goal error</dt><dd>{format(typeof b.evaluation.goal_error_m==='number'?b.evaluation.goal_error_m*1000:undefined,1)} mm</dd></div><div><dt>Joint path</dt><dd>{format(b.evaluation.joint_path_length_rad,2)} rad</dd></div></>:<><div><dt>Training RMSE</dt><dd>{format(b.evaluation.train_rmse,5)}</dd></div><div><dt>Held-out RMSE</dt><dd>{format(b.evaluation.heldout_rmse,5)}</dd></div><div><dt>Training BIC</dt><dd>{format(b.evaluation.training_bic,1)}</dd></div><div><dt>Numerical fit</dt><dd>Computed</dd></div></>}</dl>
  </article>;
}
