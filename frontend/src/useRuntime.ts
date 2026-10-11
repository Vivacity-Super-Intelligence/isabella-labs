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
  const stagedConfig=useRef<Dict|null>(null);

  const adopt=useCallback(async(s:Session,version:number)=>{
    if(version!==generation.current)return;
    setSession(s);currentSession.current=s;
    if(currentWorld.current?.id!==s.world_id){
      const w=await api.world(s.world_id),state=await api.state(s.world_id);
      if(version!==generation.current)return;
      currentWorld.current=w;put(`${backend}:world`,w.id);setWorld(w);setObservation(state.observation as Dict);setLiveState(null);setBranches([]);
    }
    if(!inspecting.current&&s.experiment_id&&currentExperiment.current?.id!==s.experiment_id){
      const e=await api.experiment(s.experiment_id);
      if(version!==generation.current)return;
      currentExperiment.current=e;setExperiment(e);setBranches([]);setLiveState(null);
    }
  },[backend]);

  useEffect(()=>{
    const version=++generation.current;let active=true,refreshing=false;
    inspecting.current=false;
    stagedConfig.current=null;
    try{
      const saved=JSON.parse(get(`${backend}:settings`)??'null');
      if(saved&&typeof saved==='object'&&!Array.isArray(saved))stagedConfig.current=saved as Dict;
    }catch{/* Ignore invalid optional local preferences. */}
    setWorld(null);currentWorld.current=null;setSession(null);currentSession.current=null;
    setExperiment(null);currentExperiment.current=null;setObservation(null);setBranches([]);setEvents([]);setLiveState(null);setLoaded(false);setError(null);
    const refresh=async()=>{
      if(refreshing||!active||lock.current)return;refreshing=true;
      try{
        const source=currentSession.current?.id;
        if(source){
          const s=await api.session(source);
          if(!active||lock.current||source!==currentSession.current?.id)return;
          await adopt(s,version);
        }else if(currentWorld.current){
          await api.health();
        }else{
          // Opening a lab initializes or restores its world, never an experiment.
          const id=get(`${backend}:session`),token=get(`${backend}:token`),worldId=get(`${backend}:world`);
          let restored:Session|null=null;
          if(id&&token){
            setSessionToken(token);
            try{
              restored=await api.session(id);
              // A reload does not renew an old autonomous run without consent.
              if(['active','stopping'].includes(restored.status))restored=await api.stopSession(id);
            }catch(e){if(!(e instanceof APIError&&[403,404].includes(e.status)))throw e;}
          }
          if(!active||lock.current)return;
          if(restored&&(!worldId||worldId===restored.world_id))await adopt(restored,version);
          else{
            let w:World|null=null;
            if(worldId){try{w=await api.world(worldId);}catch(e){if(!(e instanceof APIError&&[403,404].includes(e.status)))throw e;}}
            w??=await api.create(backend);
            const state=await api.state(w.id);
            if(!active||lock.current||version!==generation.current)return;
            put(`${backend}:world`,w.id);currentWorld.current=w;setWorld(w);setObservation(state.observation as Dict);
          }
        }
        if(active&&version===generation.current){setOnline(true);setLoaded(true);}
      }catch(e){if(active){setError(errorMessage(e));setOnline(false);setLoaded(true);}}
      finally{refreshing=false;}
    };
    refresh();const interval=setInterval(refresh,1000);
    return()=>{active=false;clearInterval(interval);};
  },[backend,epoch,adopt]);

  useEffect(()=>{
    const id=experiment?.id;if(!id)return;
    let active=true,terminal=false,refreshing=false,sequence=-1,eventCursor=0,lastBranches=0;
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
        if(isBusy(e)&&Date.now()-lastBranches>5000){
          const b=await api.branches(id);if(active)setBranches(b);lastBranches=Date.now();
        }
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
    await stop();inspecting.current=false;const s=await ensureSession(backend,stagedConfig.current??currentWorld.current?.config,true);await adopt(s,generation.current);
  });
  const togglePause=()=>perform(async()=>{
    const s=currentSession.current;if(!s||s.status!=='active')return;
    const next=await(s.pause_requested?api.resumeSession(s.id):api.pauseSession(s.id));
    currentSession.current=next;setSession(next);
  });
  const apply=(config:Dict)=>perform(async()=>{
    await stop();inspecting.current=false;const w=currentWorld.current;
    if(!w)return;
    const changed=await api.environment(w.id,config),state=await api.state(w.id);
    // Retain user-selected inputs, including the explicit scientific control,
    // so waiting or reloading between Apply and Start does not change the request.
    stagedConfig.current=config;put(`${backend}:settings`,JSON.stringify(config));
    currentWorld.current=changed;setWorld(changed);setObservation(state.observation as Dict);setLiveState(null);
    currentSession.current=null;setSession(null);
    if(currentExperiment.current){const e=await api.experiment(currentExperiment.current.id);currentExperiment.current=e;setExperiment(e);}
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
    run:start,stop,togglePause,apply,reset,history,reconnect:()=>setEpoch(e=>e+1),clearError:()=>setError(null)};
}
