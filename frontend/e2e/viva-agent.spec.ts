import {expect,test} from '@playwright/test';

test('typed Viva command changes a real physical configuration without auto-running',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await expect(page.getByRole('heading',{name:'Viva'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start voice session'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Start voice session'})).toBeDisabled();
 await expect(page.locator('.viva-voice-note')).toContainText('Typed commands work now');
 const input=page.getByLabel('Or type a command');
 await input.fill('Hey Viva, make the object heavier');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(1,{timeout:60000});
 await expect(page.locator('.viva-caption')).toContainText('0.075 kg');
 await expect(page.getByTestId('experiment-status')).toContainText('Ready to start');
 await page.getByRole('button',{name:'Undo last Viva world edit'}).click();
 await expect(page.locator('.viva-caption')).toContainText('0.06 kg',{timeout:60000});
 await expect(page.getByRole('button',{name:'Undo last Viva world edit'})).toHaveCount(0);
 await page.getByRole('button',{name:'Close Viva and turn off microphone'}).click();
 await expect(page.getByRole('button',{name:'Open Viva voice and command assistant'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('invalid command fails visibly without changing the world',async({page})=>{
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Set mass to 2 kilograms');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.locator('.viva-steps li[data-status="failed"]')).toHaveCount(1,{timeout:60000});
 await expect(page.getByRole('alert').last()).toContainText(/mass.*0.15 kg/i);
});

test('mobile and keyboard flow exposes a reduced-motion voice panel',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Viva'})).toBeVisible();
 expect(await page.locator('.viva-radial i').first().evaluate(element=>getComputedStyle(element).transitionDuration)).toBe('0s');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('heading',{name:'Viva'})).toBeHidden();
 await expect(page.getByRole('button',{name:'Open Viva voice and command assistant'})).toBeFocused();
});

test('six-axis sorting runs real MuJoCo and replays only after its measured result exists',async({page})=>{
 test.setTimeout(300_000);
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Hey Viva, I want a 6 DOF robotic arm, then a high fidelity simulation showing sorting, then replay');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.locator('.viva-steps li')).toHaveCount(5,{timeout:60000});
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(4,{timeout:90000});
 await expect(page.locator('.viva-caption')).toContainText(/MuJoCo experiment started|Replay measured trajectory/);
 const run=await expect.poll(async()=>page.evaluate(async()=>{
  const token=localStorage.getItem('vivacity:workspace-capability');
  const response=await fetch('http://127.0.0.1:8765/v1/workspace/runs',{headers:{'X-Workspace-Token':token??''}});
  const runs=await response.json();return runs.find((item:{provenance:{robot_id:string;operation_id:string}})=>item.provenance.robot_id==='ur5e'&&item.provenance.operation_id==='sorting')??null;
 }),{timeout:90000}).not.toBeNull();
 void run;
 const measurement=await expect.poll(async()=>page.evaluate(async()=>{
  const token=localStorage.getItem('vivacity:workspace-capability');
  const response=await fetch('http://127.0.0.1:8765/v1/workspace/runs',{headers:{'X-Workspace-Token':token??''}});
  const runs=await response.json();const item=runs.find((entry:{provenance:{robot_id:string;operation_id:string}})=>entry.provenance.robot_id==='ur5e'&&entry.provenance.operation_id==='sorting');
  return item?.experiments?.[0]?.experiment?.status??null;
 }),{timeout:180000,intervals:[1000,2000,5000]}).toMatch(/completed|failed/);
 void measurement;
 const evidence=await page.evaluate(async()=>{
  const token=localStorage.getItem('vivacity:workspace-capability');
  const runs=await (await fetch('http://127.0.0.1:8765/v1/workspace/runs',{headers:{'X-Workspace-Token':token??''}})).json();
  const item=runs.find((entry:{provenance:{robot_id:string;operation_id:string}})=>entry.provenance.robot_id==='ur5e'&&entry.provenance.operation_id==='sorting');
  return item?.experiments?.[0]??null;
 });
 expect(evidence).not.toBeNull();
 expect(evidence.validation_count).toBeGreaterThan(0);
 expect(Array.isArray(evidence.evaluations)).toBe(true);
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(5,{timeout:60000});
 await expect(page.locator('.viva-caption')).toContainText('Replaying the selected measured trajectory.');
 await page.getByRole('button',{name:'Close Viva and turn off microphone'}).click();
 await expect(page.getByRole('button',{name:/Pause replay|Resume replay|Replay selected trajectory/})).toBeVisible();
});

test('a custom six-axis request creates an honest editable MuJoCo draft',async({page})=>{
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Design a custom robot arm');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(1,{timeout:60000});
 const design=page.locator('.viva-designer');
 await expect(design.locator('summary')).toContainText('MuJoCo compiled');
 await design.locator('summary').click();
 await expect(design).toContainText('Draft only');
 await design.getByLabel('Link 1 length · m').fill('0.17');
 await design.getByRole('button',{name:'Validate new draft'}).click();
 await expect(design).toContainText('Model SHA-256');
 await expect(design.getByRole('button',{name:'Download MJCF'})).toBeEnabled();
});

test('spoken local path requires a user-selected upload',async({page})=>{
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Import a robot file from my local folder');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.getByRole('button',{name:'Choose a local robot or world file'})).toBeVisible();
 await page.locator('.viva-file-input').setInputFiles({name:'triangle.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')});
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(1,{timeout:60000});
 await expect(page).toHaveURL(/\/import$/);
 await expect(page.locator('.viva-caption')).toContainText('Asset staged for import');
});

test('cancel while awaiting a local file stops the remaining actions',async({page})=>{
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Import a robot file from my local folder, then run the experiment');
 await page.getByRole('button',{name:'Send command'}).click();
 await expect(page.getByRole('button',{name:'Choose a local robot or world file'})).toBeVisible();
 await page.getByRole('button',{name:'Stop queued actions'}).click();
 await expect(page.locator('.viva-steps li[data-status="cancelled"]')).toHaveCount(2);
 await expect(page.getByTestId('experiment-status')).toContainText('Ready to start');
 await expect(page.locator('.viva-caption')).toContainText('Queued actions stopped.');
});

test('a supported directory picker imports only a user-selected single model file',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>({
  async *values(){yield {kind:'file',name:'triangle.obj',getFile:async()=>new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'],'triangle.obj',{type:'text/plain'})};}
 })}));
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByLabel('Or type a command').fill('Import a robot file from my local folder');
 await page.getByRole('button',{name:'Send command'}).click();
 await page.getByRole('button',{name:'Choose a folder with one model file'}).click();
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(1,{timeout:60000});
 await expect(page).toHaveURL(/\/import$/);
});

test('voice signal follows microphone and spoken audio events, then releases the microphone',async({page})=>{
 await page.route('**/v1/agent/voice/capabilities',route=>route.fulfill({json:{schema_version:'vivacity.voice-capabilities/1.0',available:true,reason:null,max_session_seconds:180}}));
 await page.route('**/v1/agent/voice/sessions',route=>route.fulfill({status:201,json:{schema_version:'vivacity.voice-session/1.0',id:'test-voice',client_secret:'ephemeral-test',expires_at:Date.now()/1000+60,max_seconds:180}}));
 await page.route('**/v1/agent/voice/sessions/test-voice/stop',route=>route.fulfill({json:{id:'test-voice',status:'closed'}}));
 await page.addInitScript(()=>{
  const root=window as typeof window & {__vivaFakeMessage?:(event:object)=>void;__vivaTrackStopped?:()=>boolean;__vivaOutputActive?:boolean;__vivaSentEvents?:object[]};
  root.__vivaSentEvents=[];
  let stopped=false;
  const track={stop:()=>{stopped=true;}};
  root.__vivaTrackStopped=()=>stopped;
  const mic={kind:'input',getAudioTracks:()=>[track],getTracks:()=>[track]};
  const speaker={kind:'output',getTracks:()=>[]};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>mic}});
  class FakeAudio{
   autoplay=false;muted=false;srcObject:unknown=null;
   play(){return Promise.resolve();}
   pause(){}
  }
  class FakeAudioContext{
   createMediaStreamSource(stream:{kind:string}){return {connect:(node:{kind?:string})=>{node.kind=stream.kind;},disconnect:()=>{}};}
   createAnalyser(){return {kind:'',fftSize:256,smoothingTimeConstant:0,frequencyBinCount:128,getByteFrequencyData:(values:Uint8Array)=>values.fill(root.__vivaOutputActive?190:0),disconnect:()=>{}};}
   resume(){return Promise.resolve();}
   close(){return Promise.resolve();}
  }
  class FakePeer{
   ontrack:((event:{streams:unknown[]})=>void)|null=null;
   onconnectionstatechange:(()=>void)|null=null;
   connectionState='connected';
   channel:{readyState:string;onopen:(()=>void)|null;onmessage:((event:{data:string})=>void)|null;send:(_data:string)=>void;close:()=>void}|null=null;
   addTrack(){}
   createDataChannel(){
    this.channel={readyState:'open',onopen:null,onmessage:null,send:data=>{root.__vivaSentEvents?.push(JSON.parse(data) as object);},close:()=>{}};
    root.__vivaFakeMessage=event=>this.channel?.onmessage?.({data:JSON.stringify(event)});
    return this.channel;
   }
   createOffer(){return Promise.resolve({type:'offer',sdp:'v=0'});}
   setLocalDescription(){return Promise.resolve();}
   setRemoteDescription(){this.ontrack?.({streams:[speaker]});this.channel?.onopen?.();return Promise.resolve();}
   close(){this.connectionState='closed';}
  }
  Object.defineProperty(window,'Audio',{configurable:true,value:FakeAudio});
  Object.defineProperty(window,'AudioContext',{configurable:true,value:FakeAudioContext});
  Object.defineProperty(window,'RTCPeerConnection',{configurable:true,value:FakePeer});
  const original=window.fetch.bind(window);
  window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>String(input).includes('/v1/realtime/calls')
   ?Promise.resolve(new Response('v=0',{status:201})):original(input,init)) as typeof fetch;
 });
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 const start=page.getByRole('button',{name:'Start voice session'});
 await expect(start).toBeEnabled();
 await start.click();
 await expect(page.locator('.viva-stage-listening')).toBeVisible();
 await page.evaluate(()=>(window as typeof window & {__vivaFakeMessage:(event:object)=>void}).__vivaFakeMessage({
  type:'conversation.item.input_audio_transcription.completed',transcript:'Hey Viva, make the object heavier',
 }));
 await expect(page.locator('.viva-steps li[data-status="completed"]')).toHaveCount(1,{timeout:60000});
 await expect(page.locator('.viva-caption')).toContainText('0.075 kg');
 await expect(page.locator('.viva-stage-preparing')).toBeVisible();
 const spokenSource=await page.evaluate(()=>{
  const root=window as typeof window & {__vivaSentEvents:unknown[]};
  return JSON.stringify(root.__vivaSentEvents.find(event=>(event as {type:string}).type==='response.create'));
 });
 expect(spokenSource).toContain('0.075 kg');
 await page.evaluate(()=>{
  const root=window as typeof window & {__vivaFakeMessage:(event:object)=>void;__vivaOutputActive:boolean};
  root.__vivaOutputActive=true;
  root.__vivaFakeMessage({type:'response.created',response:{id:'resp_1'}});
 });
 await expect(page.locator('.viva-stage-preparing')).toBeVisible();
 await expect(page.locator('.viva-stage-speaking')).toHaveCount(0);
 await page.evaluate(()=>(window as typeof window & {__vivaFakeMessage:(event:object)=>void}).__vivaFakeMessage({type:'output_audio_buffer.started',response_id:'resp_1'}));
 await expect(page.locator('.viva-stage-speaking')).toBeVisible();
 await expect.poll(()=>page.locator('.viva-wave-output i').first().evaluate(element=>Number((element as HTMLElement).style.getPropertyValue('--level')))).toBeGreaterThan(.5);
 await page.evaluate(()=>(window as typeof window & {__vivaFakeMessage:(event:object)=>void}).__vivaFakeMessage({type:'response.done',response:{id:'resp_1',status:'completed'}}));
 await expect(page.locator('.viva-stage-speaking')).toBeVisible();
 await page.screenshot({path:'../artifacts/viva-speaking.png'});
 await page.evaluate(()=>{
  const root=window as typeof window & {__vivaFakeMessage:(event:object)=>void;__vivaOutputActive:boolean};
  root.__vivaOutputActive=false;
  root.__vivaFakeMessage({type:'output_audio_buffer.stopped',response_id:'resp_1'});
 });
 await expect(page.locator('.viva-stage-listening')).toBeVisible();
 await page.getByRole('button',{name:'Turn off microphone',exact:true}).click();
 await expect(page.locator('.viva-stage-offline')).toBeVisible();
 expect(await page.evaluate(()=>(window as typeof window & {__vivaTrackStopped:()=>boolean}).__vivaTrackStopped())).toBe(true);
});

test('denied microphone permission leaves typed commands available',async({page})=>{
 await page.route('**/v1/agent/voice/capabilities',route=>route.fulfill({json:{schema_version:'vivacity.voice-capabilities/1.0',available:true,reason:null,max_session_seconds:180}}));
 await page.addInitScript(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,
  value:{getUserMedia:async()=>{throw new DOMException('Permission denied','NotAllowedError');}}}));
 await page.goto('/workspace');
 await page.getByRole('button',{name:'Open Viva voice and command assistant'}).click();
 await page.getByRole('button',{name:'Start voice session'}).click();
 await expect(page.locator('.viva-error')).toContainText('Permission denied');
 await expect(page.locator('.viva-caption')).toContainText('type the same request');
 await expect(page.getByLabel('Or type a command')).toBeEnabled();
});
