import { useCallback, useEffect, useRef, useState } from 'react';
import { api, APIError, errorMessage, liveProtocols, liveWebsocketURL, setSessionToken, websocketURL } from './api';
import type { Backend, World, Experiment, Branch, Event, Dict } from './domain';
import type { components } from './generated/api';

type Session = components['schemas']['SessionResponse'];
type Live = components['schemas']['LiveState'];
const get=(key:string)=>{try{return localStorage.getItem(`vivacity:${key}`);}catch{return null;}};
const put=(key:string,value:string)=>{try{localStorage.setItem(`vivacity:${key}`,value);}catch{/* Optional persistence. */}};
const pending=new Map<Backend,Promise<Session>>();
function freshToken(){return crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');}
async function ensureSession(backend:Backend,config?:Dict,fresh=false){
  if(!pending.has(backend)){
    const work=(async()=>{
      const id=get(`${backend}:session`),token=get(`${backend}:token`);
      if(!fresh&&id&&token){setSessionToken(token);try{return await api.session(id);}catch(e){if(!(e instanceof APIError&&[403,404].includes(e.status)))throw e;}}
      const capability=freshToken();setSessionToken(capability);
      const session=await api.createSession(backend,capability,config);
      put(`${backend}:token`,capability);put(`${backend}:session`,session.id);return session;
    })().finally(()=>pending.delete(backend));pending.set(backend,work);
  }
  return pending.get(backend)!;
}
export const isBusy=(e:Experiment|null)=>e?.status==='queued'||e?.status==='running';

export function useRuntime(backend:Backend){
  const [session,setSession]=useState<Session|null>(null),[world,setWorld]=useState<World|null>(null);
  const [observation,setObservation]=useState<Dict|null>(null),[experiment,setExperiment]=useState<Experiment|null>(null);
  const [branches,setBranches]=useState<Branch[]>([]),[events,setEvents]=useState<Event[]>([]);
  const [online,setOnline]=useState(false),[loaded,setLoaded]=useState(false),[mutating,setMutating]=useState(false);
  const [error,setError]=useState<string|null>(null),[epoch,setEpoch]=useState(0);
  const [stream,setStream]=useState<'connecting'|'live'|'reconnecting'|'idle'>('idle');
  const [liveState,setLiveState]=useState<Live|null>(null);
  const currentSession=useRef(session);currentSession.current=session;
  const currentWorld=useRef(world);currentWorld.current=world;
  const currentExperiment=useRef(experiment);currentExperiment.current=experiment;
  const lock=useRef(false),generation=useRef(0);
  const inspecting=useRef(false);

  const adopt=useCallback(async(s:Session,version:number)=>{
    if(version!==generation.current)return;
    setSession(s);currentSession.current=s;
    if(currentWorld.current?.id!==s.world_id){
      const w=await api.world(s.world_id),state=await api.state(s.world_id);
      if(version!==generation.current)return;
      currentWorld.current=w;setWorld(w);setObservation(state.observation as Dict);setLiveState(null);setBranches([]);
    }
    if(!inspecting.current&&s.experiment_id&&currentExperiment.current?.id!==s.experiment_id){
      const e=await api.experiment(s.experiment_id);
      if(version!==generation.current)return;
      currentExperiment.current=e;setExperiment(e);setBranches([]);setLiveState(null);
    }
  },[]);

  useEffect(()=>{
    const version=++generation.current;let active=true,refreshing=false;
    inspecting.current=false;
    setWorld(null);currentWorld.current=null;setSession(null);currentSession.current=null;
    setExperiment(null);currentExperiment.current=null;setObservation(null);setBranches([]);setEvents([]);setLiveState(null);setLoaded(false);setError(null);
    const refresh=async()=>{
      if(refreshing||!active)return;refreshing=true;
      try{
        const s=currentSession.current?await api.session(currentSession.current.id):await ensureSession(backend);
        if(!active)return;await adopt(s,version);setOnline(true);setLoaded(true);
      }catch(e){if(active){setError(errorMessage(e));setOnline(false);setLoaded(true);}}
      finally{refreshing=false;}
    };
    refresh();const interval=setInterval(refresh,1000);
    return()=>{active=false;clearInterval(interval);};
  },[backend,epoch,adopt]);

  useEffect(()=>{
    const id=experiment?.id;if(!id)return;
    let active=true,terminal=false,refreshing=false,sequence=-1,eventCursor=0;
    let eventSocket:WebSocket|null=null,liveSocket:WebSocket|null=null;
    let reconnect:ReturnType<typeof setTimeout>|null=null;
    const append=(incoming:Event[])=>setEvents(old=>[...new Map([...old,...incoming].map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq).slice(-160));
    const measured=(live:Live|null)=>{
      if(!active||!live||live.schema_version!=='vivacity.live/1.0'||live.sequence<=sequence)return;
      sequence=live.sequence;setLiveState(live);setObservation(live.frame as Dict);
    };
    const refresh=async()=>{
      if(!active||refreshing||terminal)return;refreshing=true;
      try{
        const e=await api.experiment(id);
        if(!active)return;setOnline(true);currentExperiment.current=e;setExperiment(e);
        const batch=await api.events(id,eventCursor);if(active&&batch.length){append(batch);eventCursor=batch.at(-1)!.seq;}
        measured(await api.live(id));
        if(!isBusy(e)){
          const b=await api.branches(id),w=await api.world(e.world_id);
          if(!active)return;setBranches(b);setWorld(w);currentWorld.current=w;
          if(sequence<0){const state=await api.state(w.id);if(active)setObservation(state.observation as Dict);}
          terminal=true;setStream('idle');eventSocket?.close();liveSocket?.close();
        }
      }catch(e){if(active){setError(errorMessage(e));setStream('reconnecting');}}
      finally{refreshing=false;}
    };
    const connect=()=>{
      if(!active||terminal)return;setStream('connecting');
      liveSocket=new WebSocket(liveWebsocketURL(id),liveProtocols());
      liveSocket.onopen=()=>active&&setStream('live');
      liveSocket.onmessage=m=>{try{measured(JSON.parse(m.data) as Live);}catch(e){if(active)setError(errorMessage(e));}};
      liveSocket.onclose=()=>{if(active&&!terminal){setStream('reconnecting');reconnect=setTimeout(connect,2000);}};
      eventSocket?.close();eventSocket=new WebSocket(websocketURL(id,eventCursor),liveProtocols());
      eventSocket.onmessage=m=>{try{const event=JSON.parse(m.data) as Event;if(!active||event.seq<=eventCursor)return;eventCursor=event.seq;append([event]);if(['completed','failed','cancelled'].includes(event.kind))refresh();}catch(e){if(active)setError(errorMessage(e));}};
    };
    refresh();if(isBusy(experiment))connect();
    const poll=setInterval(refresh,1000);
    return()=>{active=false;clearInterval(poll);if(reconnect)clearTimeout(reconnect);liveSocket?.close();eventSocket?.close();};
  },[experiment?.id]);

  const perform=useCallback(async(operation:()=>Promise<void>)=>{
    if(lock.current)return;lock.current=true;setMutating(true);setError(null);
    try{await operation();}catch(e){setError(errorMessage(e));}finally{lock.current=false;setMutating(false);}
  },[]);
  const stop=useCallback(async()=>{
    const s=currentSession.current;if(!s||!['active','stopping'].includes(s.status))return;
    let result=await api.stopSession(s.id);setSession(result);currentSession.current=result;
    while(['active','stopping'].includes(result.status)){
      await new Promise(resolve=>setTimeout(resolve,150));result=await api.session(s.id);
      setSession(result);currentSession.current=result;
    }
  },[]);
  const start=()=>perform(async()=>{
    await stop();inspecting.current=false;const s=await ensureSession(backend,currentWorld.current?.config,true);await adopt(s,generation.current);
  });
  const apply=(config:Dict)=>perform(async()=>{
    await stop();inspecting.current=false;const w=currentWorld.current;
    if(w)await api.environment(w.id,config);
    const s=await ensureSession(backend,config,true);await adopt(s,generation.current);
  });
  const reset=()=>perform(async()=>{
    await stop();const w=currentWorld.current;if(!w)return;
    const resetWorld=await api.reset(w.id),state=await api.state(w.id);
    currentWorld.current=resetWorld;setWorld(resetWorld);setObservation(state.observation as Dict);setLiveState(null);
    if(currentExperiment.current)setExperiment(await api.experiment(currentExperiment.current.id));
  });
  const history=(id:string)=>perform(async()=>{
    await stop();inspecting.current=true;const e=await api.experiment(id),b=await api.branches(id);
    currentExperiment.current=e;setExperiment(e);setBranches(b);
    const batch=await api.events(id);setEvents(batch.slice(-160));
    // Evidence inspection never substitutes a recorded trajectory into the main scene.
  });
  return {world,observation,experiment,branches,events,session,liveState,online,loaded,mutating,error,stream,
    busy:mutating||isBusy(experiment),active:session?.status==='active'||session?.status==='stopping',
    run:start,stop,apply,reset,history,reconnect:()=>setEpoch(e=>e+1),clearError:()=>setError(null)};
}
