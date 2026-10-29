import {format,type Event} from './domain';
export type LogOutcome='success'|'failure'|'neutral';
export function eventOutcome(event:Event):LogOutcome{
 if(event.kind==='failed')return 'failure';
 if(event.kind==='completed')return event.details.selected_branch_id?'success':'failure';
 if(event.kind==='branch_completed'){
  const evaluation=event.details.evaluation as {success?:boolean}|undefined;
  return evaluation?.success===true?'success':evaluation?.success===false?'failure':'neutral';
 }
 return 'neutral';
}
export function eventLabel(event:Event):string{
 const outcome=eventOutcome(event);
 if(outcome==='success')return 'PASS';if(outcome==='failure')return 'FAIL';
 return ({queued:'QUEUED',running:'START',planned:'PLAN',progress:'UPDATE',branch_completed:'RESULT',completed:'DONE',failed:'ERROR',cancelled:'STOP'})[event.kind]??'UPDATE';
}
export function describeEvent(event:Event):string{
 const d=event.details;
 switch(event.kind){
  case 'queued':return 'Experiment submitted. Independent parent state preserved.';
  case 'running':return 'Candidate generation started. Deterministic planning policy.';
  case 'planned':return `${d.followup?'Additional planning':'Planning'} complete: ${d.candidate_count ?? '—'} validation candidates; ${format(d.planning_wall_seconds,2)} s.`;
  case 'progress':return typeof d.message==='string'?d.message:`${String(d.stage??'Progress')}: generated ${d.generated??0}, screened ${d.screened??0}, rejected ${d.rejected??0}.`;
  case 'branch_completed':{
   const e=d.evaluation as {milestone?:string;status?:string;alignment_error_m?:number;vertex_coverage?:number;grasp_valid?:boolean;goal_error_m?:number;contact_violations?:unknown[]}|undefined;
   if(!e)return 'A physics branch completed; its evaluation is unavailable.';
   const status=typeof e.status==='string'?e.status.replaceAll('_',' '):'evaluation unavailable';
   if(e.milestone==='constrained_single_fold')return `Flex validation: ${status}; alignment ${format(typeof e.alignment_error_m==='number'?e.alignment_error_m*1000:undefined,2)} mm; vertex coverage ${format(typeof e.vertex_coverage==='number'?e.vertex_coverage*100:undefined,1)}%; clamp constraints ${e.grasp_valid===true?'valid':e.grasp_valid===false?'failed':'not reported'}.`;
   return `Physics validation: ${status}; goal ${format(typeof e.goal_error_m==='number'?e.goal_error_m*1000:undefined,1)} mm; ${Array.isArray(e.contact_violations)?e.contact_violations.length:'unreported'} prohibited contacts.`;
  }
  case 'completed':return d.selected_branch_id?'Ranking completed. Best measured candidate selected.':'Evaluation completed. No supported candidate; failures retained.';
  case 'failed':return `Experiment error: ${String(d.error??'See recorded evaluation')}.`;
  case 'cancelled':return 'Experiment stopped safely. Completed measured evidence is retained.';
  default:return 'Execution update received.';
 }
}
export function eventElapsed(event:Event,origin:number):string{
 const timestamp=Number(event.details.timestamp_unix_s),relative=Number(event.details.elapsed_seconds);
 const elapsed=Number.isFinite(timestamp)&&origin>0?Math.max(0,timestamp-origin):Number.isFinite(relative)?Math.max(0,relative):0;
 return `${Math.floor(elapsed/60).toString().padStart(2,'0')}:${(elapsed%60).toFixed(2).padStart(5,'0')}`;
}
