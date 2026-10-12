import { useState } from 'react';
import catalog from './generated/templates.json';

export type Selection = { arm: string; world: string; task: string };
export const DEFAULT_SELECTION: Selection = {arm:'panda',world:'manufacturing',task:'pick_place'};
export const DEFAULT_CONFIG = {task:'pick_place',obstacle_enabled:false,obstacle_position:[.75,-.4,.22]};
export const selectionKey = (s:Selection) => `${s.arm}:${s.world}:${s.task}`;
export function selectionNames(s:Selection) {
  return [catalog.arms.find(o=>o.id===s.arm)?.name,catalog.worlds.find(o=>o.id===s.world)?.name,catalog.tasks.find(o=>o.id===s.task)?.name].join(' / ');
}

export default function TemplatePicker({loaded,busy,load}:{loaded:Selection;busy:boolean;load:(s:Selection)=>Promise<boolean>}) {
  const [draft,setDraft]=useState(loaded),[open,setOpen]=useState(true),[loading,setLoading]=useState(false);
  const arm=catalog.arms.find(o=>o.id===draft.arm)!,world=catalog.worlds.find(o=>o.id===draft.world)!,task=catalog.tasks.find(o=>o.id===draft.task)!;
  const incompatible=(draft.task==='cloth_fold')!==(draft.world==='textile');
  const reference=arm.status==='reference'||task.status==='reference';
  const ready=!reference&&!incompatible;
  const unchanged=selectionKey(loaded)===selectionKey(draft);
  const reason=arm.status==='reference'?arm.scope:task.status==='reference'?task.scope:incompatible?'Pair cloth folding with the textile station. Other stations support object handling.':'';
  const apply=async()=>{setLoading(true);try{if(await load(draft))setOpen(false);}finally{setLoading(false);}};
  return <section className="template-area" aria-labelledby="templates-heading">
    <div className="template-heading"><div><span className="eyebrow">Robotics templates</span><h1 id="templates-heading">Choose an arm. A world. A task.</h1><p>Test alternatives in physics before committing a robot action.</p></div><button className="secondary" aria-expanded={open} aria-controls="template-choices" onClick={()=>setOpen(v=>!v)}>{open?'Hide templates':'Choose templates'}</button></div>
    <div id="template-choices" hidden={!open}>
      <div className="template-columns">
        {([{key:'arm',number:'01',name:'Robot arm',options:catalog.arms},{key:'world',number:'02',name:'Operating world',options:catalog.worlds},{key:'task',number:'03',name:'Task',options:catalog.tasks}] as const).map(group=><fieldset key={group.key} disabled={busy||loading}><legend><span>{group.number}</span>{group.name}</legend>{group.options.map(option=><label className="template-option" key={option.id} data-selected={draft[group.key]===option.id}><input type="radio" name={`template-${group.key}`} value={option.id} checked={draft[group.key]===option.id} onChange={()=>setDraft(s=>({...s,[group.key]:option.id}))}/><span><strong>{option.name}</strong><small>{option.technical}</small></span><em>{option.status==='reference'?'Planned':option.status==='experimental'?'Experimental':'Runnable'}</em></label>)}</fieldset>)}
      </div>
      <div className="template-context">
        <div><h2>Application</h2><p>{world.business} {task.business}</p><p className="small">{world.scope} {task.scope}</p></div>
        <div><h2>Physical capability</h2><p>{arm.technical}. {arm.business}</p>{ready&&<p className="small">{arm.scope}</p>}<p role="status" className={ready?'small':'template-warning'}>{ready?'Loading creates an idle physical world. Start experiments when you are ready.':reason}</p></div>
        <button className="primary" disabled={!ready||busy||loading||unchanged} onClick={apply}>{loading?'Loading world…':unchanged?'Template loaded':ready?'Load this template':'Adapter required'}</button>
      </div>
    </div>
    <div className="runtime-value"><p><strong>For automation teams</strong> Compare feasible actions, inspect failures, and repeat with changed conditions before a physical trial.</p><p><strong>The Vivacity runtime</strong> One state → independent physics branches → measured selection → fresh execution. Export the evidence for integration.</p></div>
  </section>;
}
