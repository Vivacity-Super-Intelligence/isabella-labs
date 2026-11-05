type VoicePhase='connecting'|'listening'|'hearing'|'preparing'|'speaking'|'offline';
type RealtimeEvent={type:string;transcript?:string;delta?:string;response_id?:string;response?:{id?:string;status?:string};error?:{message?:string}};
export type VoiceCallbacks={phase:(phase:VoicePhase)=>void;transcript:(text:string)=>void;levels:(input:number[],output:number[])=>void;error:(message:string)=>void;playbackBlocked:(blocked:boolean)=>void};

/** Browser WebRTC audio. The provider never receives simulator authority. */
export class VivaRealtime{
 private pc:RTCPeerConnection|null=null;
 private channel:RTCDataChannel|null=null;
 private audio:HTMLAudioElement|null=null;
 private context:AudioContext|null=null;
 private input:AnalyserNode|null=null;
 private output:AnalyserNode|null=null;
 private sources:MediaStreamAudioSourceNode[]=[];
 private raf=0;
 private lastLevelAt=0;
 private stream:MediaStream|null=null;
 private muted=false;
 private responding=false;
 private responseId:string|null=null;
 private cancelWhenCreated=false;
 private callbacks:VoiceCallbacks;
 constructor(callbacks:VoiceCallbacks){this.callbacks=callbacks;}
 private send(event:object){if(this.channel?.readyState==='open')this.channel.send(JSON.stringify(event));}
 private analyse(){
  const bins=(node:AnalyserNode|null)=>{
   if(!node)return Array(24).fill(0) as number[];
   const values=new Uint8Array(node.frequencyBinCount);node.getByteFrequencyData(values);
   return Array.from({length:24},(_,index)=>{
    const first=Math.floor((index/24)**1.25*values.length*.45);
    const last=Math.max(first+1,Math.floor(((index+1)/24)**1.25*values.length*.45));
    let sum=0;for(let i=first;i<last;i++)sum+=values[i];
    return Math.min(1,(sum/(last-first)/255)**1.25*1.8);
   });
  };
  const now=performance.now();
  const period=matchMedia('(prefers-reduced-motion: reduce)').matches?100:33;
  if(now-this.lastLevelAt>=period){
   this.lastLevelAt=now;
   this.callbacks.levels(bins(this.input),this.muted?Array(24).fill(0):bins(this.output));
  }
  this.raf=requestAnimationFrame(()=>this.analyse());
 }
 private connectAnalyser(stream:MediaStream,kind:'input'|'output'){
  if(!this.context)this.context=new AudioContext();
  void this.context.resume().catch(()=>{});
  const source=this.context.createMediaStreamSource(stream),node=this.context.createAnalyser();
  node.fftSize=256;node.smoothingTimeConstant=.78;source.connect(node);this.sources.push(source);
  if(kind==='input')this.input=node;else this.output=node;
 }
 async connect(secret:string,stream:MediaStream){
  this.stream=stream;this.callbacks.phase('connecting');
  try{
   const pc=new RTCPeerConnection();this.pc=pc;
   const audio=new Audio();audio.autoplay=true;audio.muted=this.muted;this.audio=audio;
   pc.ontrack=event=>{audio.srcObject=event.streams[0];this.connectAnalyser(event.streams[0],'output');void audio.play().then(()=>this.callbacks.playbackBlocked(false)).catch(()=>{this.callbacks.playbackBlocked(true);this.callbacks.error('Audio playback was blocked. Select Enable Viva audio to hear replies.');});};
   pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState)){this.callbacks.phase('offline');if(pc.connectionState!=='closed')this.callbacks.error('Voice disconnected. Typed commands still work.');}};
   stream.getAudioTracks().forEach(track=>pc.addTrack(track,stream));this.connectAnalyser(stream,'input');
   const channel=pc.createDataChannel('oai-events');this.channel=channel;
   channel.onopen=()=>this.callbacks.phase('listening');
   channel.onclose=()=>{if(pc.connectionState!=='closed')this.callbacks.error('Voice disconnected. Typed commands still work.');};
   channel.onmessage=event=>{
    let message:RealtimeEvent;try{message=JSON.parse(event.data) as RealtimeEvent;}catch{return;}
    if(message.type==='input_audio_buffer.speech_started'){this.interrupt();this.callbacks.phase('hearing');}
    if(message.type==='input_audio_buffer.speech_stopped')this.callbacks.phase('listening');
    if(message.type==='conversation.item.input_audio_transcription.completed'&&message.transcript?.trim())this.callbacks.transcript(message.transcript.trim());
    if(message.type==='response.created'&&message.response?.id){
     if(this.cancelWhenCreated){
      this.send({type:'response.cancel',response_id:message.response.id});
      this.send({type:'output_audio_buffer.clear'});
      this.cancelWhenCreated=false;
     }else{this.responseId=message.response.id;this.callbacks.phase('preparing');}
    }
    if(message.type==='output_audio_buffer.started')this.callbacks.phase('speaking');
    if(message.type==='output_audio_buffer.stopped'||message.type==='output_audio_buffer.cleared'){
     if(!message.response_id||message.response_id===this.responseId){this.responding=false;this.responseId=null;this.callbacks.phase('listening');}
    }
    if(message.type==='response.done'&&message.response?.status!=='completed'){
     this.responding=false;this.responseId=null;this.callbacks.phase('listening');
     if(message.response?.status==='failed')this.callbacks.error('Spoken reply failed. The written result remains available.');
    }
    if(message.type==='error')this.callbacks.error(message.error?.message??'Voice service returned an error.');
   };
   const offer=await pc.createOffer();await pc.setLocalDescription(offer);
   const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',body:offer.sdp,
    headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/sdp'}});
   if(!response.ok)throw new Error(`Voice connection rejected (${response.status}).`);
   await pc.setRemoteDescription({type:'answer',sdp:await response.text()});
   this.analyse();
  }catch(error){this.close();throw error;}
 }
 speak(verifiedReport:string,language:'English'|'Hindi'|'Hinglish'='English'){
  if(this.muted||this.channel?.readyState!=='open')return;
  const text=verifiedReport.slice(0,350);
  this.interrupt();
  this.send({type:'response.create',response:{conversation:'none',output_modalities:['audio'],
   instructions:`Speak only the verified status in natural ${language}. Be warm and concise. Keep every number, unit and measured result exact. Do not add claims.`,
   input:[{type:'message',role:'user',content:[{type:'input_text',text:`Verified workspace status: ${text}`}]}]}});
  this.responding=true;
  // The response may be queued before any audio is received. Only the provider's
  // output_audio_buffer.started event may put the UI in its speaking state.
  this.callbacks.phase('preparing');
 }
 interrupt(){
  if(!this.responding)return;
  if(this.responseId)this.send({type:'response.cancel',response_id:this.responseId});
  else this.cancelWhenCreated=true;
  this.send({type:'output_audio_buffer.clear'});
  this.responding=false;this.responseId=null;this.callbacks.phase('listening');
 }
 setMuted(value:boolean){this.muted=value;if(this.audio)this.audio.muted=value;if(value)this.interrupt();}
 async resumeAudio(){
  if(!this.audio)return false;
  try{this.audio.muted=false;this.muted=false;await this.audio.play();this.callbacks.playbackBlocked(false);return true;}
  catch{this.callbacks.playbackBlocked(true);return false;}
 }
 close(){
  cancelAnimationFrame(this.raf);this.channel?.close();this.pc?.close();this.stream?.getTracks().forEach(track=>track.stop());
  this.sources.forEach(source=>source.disconnect());this.input?.disconnect();this.output?.disconnect();
  void this.context?.close();if(this.audio){this.audio.pause();this.audio.srcObject=null;}
  this.channel=null;this.pc=null;this.stream=null;this.input=null;this.output=null;this.context=null;this.sources=[];this.audio=null;this.responding=false;this.responseId=null;this.cancelWhenCreated=false;
  this.callbacks.levels(Array(24).fill(0),Array(24).fill(0));this.callbacks.phase('offline');
  this.callbacks.playbackBlocked(false);
 }
}
