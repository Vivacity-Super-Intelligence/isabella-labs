import {useEffect,useRef,useState,type CSSProperties,type FormEvent} from 'react';
import {ArrowCounterClockwise,ArrowRight,Microphone,MicrophoneSlash,SpeakerHigh,SpeakerSlash,Stop,X} from '@phosphor-icons/react';
import {errorMessage} from './api';
import type {World} from './domain';
import {workspaceApi} from './workspaceApi';
import {vivaAgentApi,type VivaAction,type VivaOutcome,type VivaPlan} from './vivaAgentApi';
import {VivaRealtime} from './vivaRealtime';
import RobotDesignDraft from './RobotDesignDraft';
import './vivaPanel.css';

const silent=Array(24).fill(0) as number[];
const replyLanguage=(utterance:string):'English'|'Hindi'|'Hinglish'=>
 /[\u0900-\u097f]/.test(utterance)?'Hindi':/\b(?:bhai|yaar|karo|karna|badhao|ghatao|chahiye|dikhao|banao|ruk|roko|phir|fir|aur)\b/i.test(utterance)?'Hinglish':'English';
type Props={world:World|null;online:boolean;canUndo:boolean;execute:(action:VivaAction)=>Promise<VivaOutcome>;cancelRun:()=>Promise<void>};

export default function VivaPanel({world,online,canUndo,execute,cancelRun}:Props){
 const [open,setOpen]=useState(false),[input,setInput]=useState(''),[caption,setCaption]=useState('Tell Viva what to change, then inspect the measured result.');
 const [plan,setPlan]=useState<VivaPlan|null>(null),[step,setStep]=useState<number|null>(null),[busy,setBusy]=useState(false);
 const [phase,setPhase]=useState<'offline'|'connecting'|'listening'|'hearing'|'speaking'>('offline');
 const [inputLevels,setInputLevels]=useState<number[]>(silent),[outputLevels,setOutputLevels]=useState<number[]>(silent);
 const [muted,setMuted]=useState(false),[playbackBlocked,setPlaybackBlocked]=useState(false),[error,setError]=useState(''),[voiceId,setVoiceId]=useState<string|null>(null);
 const [awaitingFile,setAwaitingFile]=useState(false);
 const [voiceAvailability,setVoiceAvailability]=useState<{available:boolean;reason:string|null}|null>(null);
 const voice=useRef<VivaRealtime|null>(null),activePlan=useRef<VivaPlan|null>(null),cancelled=useRef(false),busyRef=useRef(false);
 const launchRef=useRef<HTMLButtonElement>(null),inputRef=useRef<HTMLInputElement>(null),fileRef=useRef<HTMLInputElement>(null),fileResolve=useRef<((file:File)=>void)|null>(null),fileReject=useRef<((error:Error)=>void)|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),hardStop=useRef<ReturnType<typeof setTimeout>|null>(null),voiceIdRef=useRef<string|null>(null);
 const agentRun=useRef(false);
 const executeRef=useRef(execute);executeRef.current=execute;
 const worldRef=useRef(world);worldRef.current=world;

 const stopVoice=()=>{
  if(timer.current)clearTimeout(timer.current);timer.current=null;
  if(hardStop.current)clearTimeout(hardStop.current);hardStop.current=null;
  voice.current?.close();voice.current=null;
  const id=voiceIdRef.current;voiceIdRef.current=null;setVoiceId(null);
  if(id)void vivaAgentApi.stopVoice(id).catch(()=>{});
 };
 const resetTimer=()=>{if(!voice.current)return;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{stopVoice();setCaption('Voice stopped after inactivity. Start it again when ready.');},90000);};
 useEffect(()=>()=>{stopVoice();},[]);
 useEffect(()=>{if(!online&&voice.current){stopVoice();setCaption('The physical runtime disconnected. Voice stopped; retry when it reconnects.');}},[online]);
 useEffect(()=>{if(!open)return;let active=true;vivaAgentApi.voiceCapabilities().then(value=>{if(active)setVoiceAvailability(value);}).catch(()=>{if(active)setVoiceAvailability({available:false,reason:'Voice availability could not be checked. Typed commands work.'});});return()=>{active=false;};},[open]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&open){voice.current?.interrupt();setOpen(false);stopVoice();requestAnimationFrame(()=>launchRef.current?.focus());}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[open]);
 const startVoice=async()=>{
  if(voice.current){stopVoice();setCaption('Microphone off.');return;}
  if(!online){setCaption('Connect to the physical runtime before starting voice.');return;}
  if(!voiceAvailability?.available){setCaption(voiceAvailability?.reason??'Voice is not configured. Type your request.');return;}
  setError('');setPhase('connecting');
  let stream:MediaStream|null=null;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('This browser cannot open a microphone here. Type your request instead.');
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   const credential=await vivaAgentApi.createVoice();
   voiceIdRef.current=credential.id;
   if(credential.expires_at<=Date.now()/1000)throw new Error('Voice credential expired. Please try again.');
   const client=new VivaRealtime({
    phase:setPhase,levels:(heard,spoken)=>{setInputLevels(heard);setOutputLevels(spoken);},
    transcript:text=>{resetTimer();setInput(text);void submit(text);},
    error:message=>{setError(message);setCaption(message);if(message.startsWith('Voice disconnected'))stopVoice();},
    playbackBlocked:setPlaybackBlocked,
   });
   await client.connect(credential.client_secret,stream);voice.current=client;stream=null;
   setVoiceId(credential.id);resetTimer();
   hardStop.current=setTimeout(()=>{stopVoice();setCaption('The three-minute voice session ended. Start a new one when ready.');},credential.max_seconds*1000);
   setCaption('Listening. Say “Hey Viva” and a workspace command.');
  }catch(cause){stream?.getTracks().forEach(track=>track.stop());stopVoice();setPhase('offline');setError(errorMessage(cause));setCaption('Voice is unavailable. You can type the same request.');}
 };
 const chooseFile=()=>new Promise<File>((resolve,reject)=>{
  setAwaitingFile(true);
  const timeout=setTimeout(()=>{fileResolve.current=null;fileReject.current=null;setAwaitingFile(false);reject(new Error('File selection timed out.'))},120000);
  fileResolve.current=file=>{clearTimeout(timeout);fileReject.current=null;setAwaitingFile(false);resolve(file);};
  fileReject.current=error=>{clearTimeout(timeout);fileResolve.current=null;setAwaitingFile(false);reject(error);};
 });
 const chooseFolder=async()=>{
  const pick=(window as Window & {showDirectoryPicker?:()=>Promise<FileSystemDirectoryHandle>}).showDirectoryPicker;
  if(!pick)return;
  try{
   // This call must stay inside the button handler so the browser sees a user gesture.
   const directory=await pick.call(window);
   const candidates:FileSystemFileHandle[]=[];
   for await(const handle of (directory as FileSystemDirectoryHandle & {values():AsyncIterable<FileSystemHandle>}).values()){
    if(handle.kind==='file'&&/\.(?:zip|urdf|xml|glb|gltf|obj|stl)$/i.test(handle.name))candidates.push(handle as FileSystemFileHandle);
    if(candidates.length>1)break;
   }
   if(candidates.length!==1){
    setError(candidates.length?'That folder has multiple importable files. Choose the specific file instead.':'No supported robot or world file was found in that folder.');
    return;
   }
   fileResolve.current?.(await candidates[0].getFile());fileResolve.current=null;
  }catch(cause){
   if((cause as DOMException).name!=='AbortError')setError(errorMessage(cause));
  }
 };
 const submit=async(text:string)=>{
  if(busyRef.current||!text.trim())return;
  busyRef.current=true;cancelled.current=false;setBusy(true);setError('');setInput(text);setCaption('Checking the request against this workspace…');resetTimer();
  try{
   let current=await vivaAgentApi.submit(text,worldRef.current);
   setPlan(current);activePlan.current=current;
   if(current.status==='needs_clarification'){
    setCaption(current.explanation);voice.current?.speak(current.explanation,replyLanguage(text));return;
   }
   let expectedWorld=current.world_id&&current.expected_revision!=null?
    {id:current.world_id,revision:current.expected_revision}:null;
   for(let index=0;index<current.actions.length;index++){
    if(cancelled.current)break;
    const action=current.actions[index];setStep(index);setCaption(action.label);
    if(action.kind==='run_experiment')agentRun.current=true;
    try{
     const readOnlyResult=['compare','replay','export'].includes(action.kind);
     if(expectedWorld&&(worldRef.current?.id!==expectedWorld.id||(!readOnlyResult&&worldRef.current.revision!==expectedWorld.revision)))
      throw new Error('The physical world changed while Viva was working. Review the current world and ask again.');
     let outcome:VivaOutcome;
     if(action.kind==='import_folder'){
      setCaption('Select a local asset file to import. Vivacity cannot read a spoken path.');
      const file=await chooseFile();
      const uploaded=await workspaceApi.upload(file);
      outcome=await executeRef.current({...action,arguments:{...action.arguments,staged_import_id:uploaded.id}});
     }else outcome=await executeRef.current({...action,arguments:{...action.arguments,_idempotency_key:`${current.id}-${index}`}});
     if(cancelled.current)break;
     if(outcome.world_id&&outcome.world_revision!=null)expectedWorld={id:outcome.world_id,revision:outcome.world_revision};
     current=await vivaAgentApi.outcome(current.id,index,outcome);
     setPlan(current);activePlan.current=current;setCaption(outcome.message);
    }catch(cause){
     if(cancelled.current)break;
     const message=errorMessage(cause);
     try{current=await vivaAgentApi.outcome(current.id,index,{success:false,message});setPlan(current);activePlan.current=current;}catch{/* Keep original error visible. */}
     setError(message);setCaption(`${action.label} failed: ${message}`);break;
    }
   }
   if(!cancelled.current&&current.status==='completed'){
    const result=current.actions.at(-1)?.outcome??'Actions completed.';
    setCaption(result);voice.current?.speak(result,replyLanguage(text));
   }else if(current.status==='failed')voice.current?.speak(`The request stopped at ${current.actions.find(a=>a.status==='failed')?.label}. ${current.actions.find(a=>a.status==='failed')?.outcome}`,replyLanguage(text));
  }catch(cause){setError(errorMessage(cause));setCaption(errorMessage(cause));voice.current?.speak(errorMessage(cause),replyLanguage(text));}
  finally{setStep(null);setBusy(false);busyRef.current=false;agentRun.current=false;}
 };
 const cancel=async()=>{
  cancelled.current=true;fileReject.current?.(new Error('File selection cancelled.'));fileResolve.current=null;fileReject.current=null;setAwaitingFile(false);voice.current?.interrupt();
  if(activePlan.current&&['planned','running'].includes(activePlan.current.status)){
   try{const result=await vivaAgentApi.cancel(activePlan.current.id);setPlan(result);activePlan.current=result;}catch(cause){setError(errorMessage(cause));}
  }
  if(agentRun.current)await cancelRun().catch(()=>{});setCaption('Queued actions stopped.');
 };
 const onSubmit=(event:FormEvent)=>{event.preventDefault();void submit(input);};
 const wave=(values:number[],name:string)=><div className={`viva-wave viva-wave-${name}`} aria-hidden="true">{values.map((value,i)=><i key={i} style={{'--level':Math.max(.06,value).toFixed(3)} as CSSProperties}/>)}</div>;
 const activity=Math.min(1,Math.max(...(phase==='speaking'?outputLevels:inputLevels)));
 return <div className={`viva-dock ${open?'is-open':''}`}>
  {!open?<button ref={launchRef} className="viva-launch" type="button" onClick={()=>{setOpen(true);requestAnimationFrame(()=>inputRef.current?.focus());}} aria-label="Open Viva voice and command assistant"><span className="viva-launch-glyph" aria-hidden="true">V</span><span>Ask Viva</span></button>:
  <section className="viva-panel" aria-label="Viva workspace assistant">
   <header className="viva-top"><div><span className="viva-eyebrow">VIVACITY · WORKSPACE</span><h2>Viva</h2></div><button className="viva-icon" aria-label="Close Viva and turn off microphone" type="button" onClick={()=>{setOpen(false);stopVoice();requestAnimationFrame(()=>launchRef.current?.focus());}}><X size={18}/></button></header>
   <div className={`viva-stage viva-stage-${phase}`} style={{'--activity':activity.toFixed(3)} as CSSProperties}>
   <div className="viva-lens" aria-hidden="true"><span/><span/><div className="viva-radial">{(phase==='speaking'?outputLevels:inputLevels).map((level,index)=><i key={index} style={{'--angle':`${index*15}deg`,'--level':Math.max(.03,level).toFixed(3)} as CSSProperties}/>)}</div><b>V</b></div>
    <div className="viva-signal"><div><span>YOU</span>{wave(inputLevels,'input')}</div><div><span>VIVA</span>{wave(outputLevels,'output')}</div></div>
    <p className="viva-phase" role="status">{phase==='offline'?'Ready for a typed request':phase==='connecting'?'Connecting microphone…':phase==='hearing'?'Hearing you':phase==='speaking'?'Speaking':'Listening'}</p>
   </div>
   <div className="viva-caption" aria-live="polite">{caption}</div>
   {error&&<p className="viva-error" role="alert">{error}</p>}
   <div className="viva-audio-controls"><button type="button" className={voiceId?'viva-mic is-active':'viva-mic'} onClick={()=>void startVoice()} disabled={!voiceId&&(!online||!voiceAvailability?.available)} aria-label={voiceId?'Turn off microphone':'Start voice session'} aria-pressed={Boolean(voiceId)} title={voiceAvailability?.reason??undefined}>{voiceId?<MicrophoneSlash size={19}/>:<Microphone size={19}/>}<span>{voiceId?'Stop listening':'Start voice'}</span></button>
    <button type="button" className="viva-icon" disabled={!voiceId} onClick={()=>{
     if(playbackBlocked){void voice.current?.resumeAudio().then(ok=>{if(ok){setMuted(false);setError('');setCaption('Viva audio enabled.');}});return;}
     const next=!muted;setMuted(next);voice.current?.setMuted(next);
    }} aria-label={playbackBlocked?'Enable Viva audio':muted?'Unmute Viva replies':'Mute Viva replies'} aria-pressed={muted}>{muted?<SpeakerSlash size={20}/>:<SpeakerHigh size={20}/>}</button></div>
   {voiceAvailability?.reason&&<p className="viva-voice-note" role="status">{voiceAvailability.reason}</p>}
   <form className="viva-compose" onSubmit={onSubmit}><label htmlFor="viva-request">Or type a command</label><div><input ref={inputRef} id="viva-request" value={input} onChange={event=>setInput(event.target.value)} maxLength={2000} placeholder="Make the object heavier, then run" disabled={busy||!online}/><button type="submit" aria-label="Send command" disabled={busy||!online||!input.trim()}><ArrowRight size={20}/></button></div></form>
   {canUndo&&<button className="viva-undo" type="button" onClick={()=>void submit('undo last change')} disabled={busy||!online}><ArrowCounterClockwise size={15}/> Undo last Viva world edit</button>}
   {plan&&<div className="viva-steps" aria-label="Ordered actions"><div className="viva-steps-head"><span>Action sequence</span><span>{plan.actions.filter(a=>a.status==='completed').length}/{plan.actions.length}</span></div><ol>{plan.actions.map((action,index)=><li key={index} data-status={action.status} aria-current={step===index?'step':undefined}><span className="viva-index">{String(index+1).padStart(2,'0')}</span><span>{action.label}{action.outcome&&<small>{action.outcome}</small>}</span></li>)}</ol></div>}
   {plan?.actions.map(action=>action.evidence?.design_id).find((id):id is string=>typeof id==='string')&&<RobotDesignDraft id={plan.actions.map(action=>action.evidence?.design_id).find((id):id is string=>typeof id==='string')!}/>}
   {awaitingFile&&<div className="viva-file-choices"><button className="viva-choose-file" type="button" onClick={()=>fileRef.current?.click()}>Choose a local robot or world file</button>{'showDirectoryPicker' in window&&<button className="viva-choose-folder" type="button" onClick={()=>void chooseFolder()}>Choose a folder with one model file</button>}</div>}
   {busy&&<button className="viva-cancel" type="button" onClick={()=>void cancel()}><Stop size={16}/>Stop queued actions</button>}
   <input ref={fileRef} className="viva-file-input" type="file" accept=".glb,.gltf,.obj,.stl,.urdf,.xml,.zip" aria-label="Choose a robot or world file" onChange={event=>{const file=event.target.files?.[0];if(file){fileResolve.current?.(file);fileResolve.current=null;}event.target.value='';}}/>
   <p className="viva-footnote">Actions use the lab's validated controls. Physics outcomes appear in the experiment log. During voice sessions, audio goes to OpenAI; Vivacity stores command text and outcomes, not audio.</p>
  </section>}
 </div>;
}
