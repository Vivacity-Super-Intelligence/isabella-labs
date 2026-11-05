import {API,getSessionToken} from './api';
import {fetchRuntime} from './apiTransport';
import {readAPIResponse} from './apiResponse';
import {workspaceToken} from './workspaceApi';
import type {components} from './generated/api';

export type VivaAction=components['schemas']['AgentAction'];
export type VivaPlan=components['schemas']['AgentRequestResponse'];
export type VivaOutcome=components['schemas']['AgentStepOutcome'];
export type VivaCredential=components['schemas']['VoiceSessionResponse'];
export type RobotDesignSpec=components['schemas']['SixAxisDesignSpec'];
export type RobotDesign=components['schemas']['RobotDesignResponse'];

async function request<T>(path:string,method:'GET'|'POST'='GET',body?:object,key?:string):Promise<T>{
 const headers=new Headers({'X-Workspace-Token':workspaceToken()});
 if(body)headers.set('Content-Type','application/json');
 if(key)headers.set('Idempotency-Key',key);
 const session=getSessionToken();if(session)headers.set('X-Session-Token',session);
 const response=await fetchRuntime(`${API}/v1/agent${path}`,{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 return await readAPIResponse(response) as T;
}
export const vivaAgentApi={
 submit:(utterance:string,world?:{id:string;revision:number}|null)=>request<VivaPlan>('/requests','POST',{
  schema_version:'vivacity.agent-request/1.0',utterance,...(world?{world_id:world.id,expected_revision:world.revision}:{})},crypto.randomUUID()),
 get:(id:string)=>request<VivaPlan>(`/requests/${encodeURIComponent(id)}`),
 outcome:(id:string,index:number,value:VivaOutcome)=>request<VivaPlan>(`/requests/${encodeURIComponent(id)}/steps/${index}/outcome`,'POST',value),
 cancel:(id:string)=>request<VivaPlan>(`/requests/${encodeURIComponent(id)}/cancel`,'POST'),
 voiceCapabilities:()=>request<components['schemas']['VoiceCapabilitiesResponse']>('/voice/capabilities'),
 createVoice:()=>request<VivaCredential>('/voice/sessions','POST'),
 stopVoice:(id:string)=>request<components['schemas']['VoiceStopResponse']>(`/voice/sessions/${encodeURIComponent(id)}/stop`,'POST'),
 createRobotDesign:(description:string,spec?:RobotDesignSpec,key:string=crypto.randomUUID())=>request<RobotDesign>('/robot-designs','POST',{description,...(spec?{spec}:{})},key),
 robotDesign:(id:string)=>request<RobotDesign>(`/robot-designs/${encodeURIComponent(id)}`),
 async downloadRobotDesign(id:string){
  const response=await fetchRuntime(`${API}/v1/agent/robot-designs/${encodeURIComponent(id)}/model.mjcf`,{headers:{'X-Workspace-Token':workspaceToken()}});
  if(!response.ok)throw new Error('Robot design download is unavailable.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`vivacity-design-${id}.mjcf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },
};
