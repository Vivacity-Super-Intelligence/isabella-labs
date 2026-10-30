import { DownloadSimple } from '@phosphor-icons/react';
import { format,type Branch } from './domain';
import {pandaTrajectoryCsv} from './pandaTrajectory';
import {useState} from 'react';
export default function ResultCard({branch:b,rank:i,selected,choose,download}:{branch:Branch;rank:number;selected:boolean;choose:()=>void;download:()=>void}){
  const [exportError,setExportError]=useState('');
  const config=b.initial_state.config as Record<string,unknown>|undefined;
  const panda=!!config&&(config.robot_model??'panda')==='panda'&&b.evaluation.success;
  const exportPanda=()=>{try{const csv=pandaTrajectoryCsv(b.trace);const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`vivacity-panda-${b.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setExportError('');}catch(e){setExportError(e instanceof Error?e.message:'Could not export joint samples.');}};
  const cloth=b.evaluation.milestone==='constrained_single_fold';
  const pickup=b.evaluation.grasp_established!==undefined;
  const measuredError=cloth?b.evaluation.alignment_error_m:b.evaluation.goal_error_m;
  const labels:Record<string,string>={two_dynamic_body_stack:'Verified two-part stack',single_component_fixture_seating:'Verified fixture seating',gravity_assisted_receptacle_insertion:'Verified gravity-assisted insertion',single_part_rule_based_sort:'Verified rule-based sorting',single_part_machine_bay_loading:'Verified machine bay loading'};
  return <article className={`result-card ${selected?'selected':''}`}>
    <div className="result-top"><span className="rank mono">#{i+1} {i===0?'Best':'Alternative'}</span><button className="icon-button" aria-label={`Download JSON for result ${i+1}`} title="Download actual recorded evidence" onClick={download}><DownloadSimple size={16}/></button></div>
    {panda&&<div className="panda-export"><button type="button" className="secondary" onClick={exportPanda}>Download Panda joint samples (.csv)</button><p>Sampled joint positions from simulation; gripper commands are not included. Not flashable or validated for robot execution.</p>{exportError&&<p role="alert">{exportError}</p>}</div>}
    <button className="result-select" aria-pressed={selected} data-testid="branch-row" data-status={b.evaluation.status} onClick={choose}><strong>{labels[b.evaluation.milestone??'']??(cloth?'Verified constrained fold':pickup?'Verified pickup & placement':'Collision-free reach')}</strong></button>
    <dl>{cloth?<><div><dt>Alignment error</dt><dd>{format((b.evaluation.alignment_error_m??0)*1000,2)} mm</dd></div><div><dt>Vertex coverage</dt><dd>{format((b.evaluation.vertex_coverage??0)*100,1)}%</dd></div><div><dt>Clamp constraints</dt><dd>{b.evaluation.grasp_valid?'Valid':'Failed'}</dd></div><div><dt>Execution</dt><dd>{format(b.evaluation.execution_duration_s,2)} s</dd></div></>:<><div><dt>{pickup?'Placement verified':'Reach verified'}</dt><dd>Yes</dd></div><div><dt>Execution</dt><dd>{format(b.evaluation.execution_duration_s,2)} s</dd></div><div><dt>{pickup?'Placement error':'Goal error'}</dt><dd>{format(typeof b.evaluation.goal_error_m==='number'?b.evaluation.goal_error_m*1000:undefined,1)} mm</dd></div><div><dt>{pickup?'Grasp & retention':'Joint path'}</dt><dd>{pickup?(b.evaluation.grasp_established&&b.evaluation.retained_during_transport?'Verified':'Failed'):`${format(b.evaluation.joint_path_length_rad,2)} rad`}</dd></div></>}</dl>{!selected&&<p className="result-brief">{format(b.evaluation.execution_duration_s,2)} s · {format(typeof measuredError==='number'?measuredError*1000:undefined,1)} mm</p>}
  </article>;
}
