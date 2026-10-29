import { useEffect, useRef, useState } from 'react';
import { type Branch, type Event } from './domain';
import {describeEvent,eventElapsed,eventLabel,eventOutcome} from './executionLog';

function failureLabel(branch:Branch){
 const status=branch.evaluation.status.replaceAll('_',' '),contacts=branch.evaluation.contact_violations??[];
 const pairs=[...new Set(contacts.map(c=>[...c.bodies].sort().join(' ↔ ')))];
 return contacts.length?`${status} · ${contacts.length} contacts · ${pairs.slice(0,3).join(', ')}${pairs.length>3?` (+${pairs.length-3} pairs)`:''}`:status;
}
export default function TechnicalInspector({events,initialized,playing,branches,select,history,initialMessage,running=false}:{events:Event[];initialized:boolean;playing:boolean;branches:Branch[];select:(id:string)=>void;history:{ids:string[];open:(id:string)=>void;disabled:boolean};initialMessage?:string;running?:boolean}){
 const log=useRef<HTMLDivElement>(null),following=useRef(true);
 const [follow,setFollow]=useState(true);
 const origin=Number(events[0]?.details.timestamp_unix_s??0);
 useEffect(()=>{if(log.current&&following.current)log.current.scrollTop=log.current.scrollHeight;},[events,playing,initialized]);
 const jumpToLatest=()=>{following.current=true;setFollow(true);if(log.current)log.current.scrollTop=log.current.scrollHeight;};
 return <details className="inspector" open>
  <summary><span>Execution log</span><span className="log-count">{events.length} events</span></summary>
  <div className="log-toolbar"><span className="log-stream-state"><span aria-hidden="true" className={running?'log-indicator active':'log-indicator'}/>{running?'Experiment running':events.length?'Recorded events':'Ready'}</span>{!follow&&<button type="button" onClick={jumpToLatest}>Latest events ↓</button>}</div>
  <div ref={log} className="event-log" role="log" aria-label="Measured execution events" aria-live="polite" aria-relevant="additions" tabIndex={0} onScroll={()=>{const el=log.current;if(el){const next=el.scrollHeight-el.scrollTop-el.clientHeight<30;following.current=next;setFollow(next);}}}>
   <p className="log-neutral log-initial"><span className="log-badge">STATE</span><span className="log-message">{initialMessage??(initialized?'World initialized. Actual state restored.':'Initializing world…')}</span></p>
   {events.map(event=>{const state=eventOutcome(event);return <p key={event.seq} className={`log-${state}`}><time>{eventElapsed(event,origin)}</time><span className="log-badge">{eventLabel(event)}</span><span className="log-message">{describeEvent(event)}</span></p>;})}
  </div>
  <p className="log-caption">Measured backend events · times relative to this experiment</p>
  <details className="recorded-evidence"><summary>Recorded failures & history</summary><div className="evidence-links">{branches.filter(b=>!b.evaluation.success).map(b=><button key={b.id} onClick={()=>select(b.id)} data-status={b.evaluation.status}>{failureLabel(b)}</button>)}{history.ids.map((id,i)=><button key={id} disabled={history.disabled} onClick={()=>history.open(id)}>Experiment {i+1}</button>)}</div></details>
 </details>;
}
