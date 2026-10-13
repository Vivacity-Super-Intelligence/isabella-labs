import {API,APIError} from './api';
import type {components} from './generated/api';

export type LibraryWorld=Omit<components['schemas']['LibraryWorld'],'spec'> & {appearance?:Record<string,unknown>|null;spec:{name:string;description:string;dimensions_m:number[];lighting:{ambient:number;key_intensity:number};geometries:{name:string;type:'box'|'cylinder';position:number[];size:number[];rgba:number[];friction:number}[]}};
export type Configuration=Required<components['schemas']['ExperimentConfiguration']>;
export type SavedConfiguration=Omit<components['schemas']['ConfigurationResponse'],'configuration'> & {configuration:Configuration};
export type Generation=components['schemas']['GenerationResponse'];
export type Resolved=components['schemas']['ResolvedConfiguration'];
export type Option={id:string;name:string;status:string;scope:string;manufacturer?:string;dof?:number;category?:string;model?:string;grippers?:string[];robots?:string[]};
export type Capabilities={openai_configured:boolean;worldlabs_configured:boolean;max_physics_trials:number;generations_per_day:number;registry:{robots:Option[];grippers:Option[];operations:Option[]}};
export function workspaceToken(){
  let token=localStorage.getItem('vivacity:workspace-capability');
  if(!token){token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');localStorage.setItem('vivacity:workspace-capability',token);}
  return token;
}
async function request<T>(path:string,method='GET',body?:unknown,extra:Record<string,string>={}):Promise<T>{
  const r=await fetch(API+'/v1/workspace'+path,{method,headers:{'X-Workspace-Token':workspaceToken(),...(body!==undefined?{'Content-Type':'application/json'}:{}),...extra},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const value=await r.json().catch(()=>null);
  if(!r.ok)throw new APIError(r.status,value?.detail??'Workspace request could not complete.');
  if(value===null)throw new Error('Workspace returned an unreadable response.');
  return value as T;
}
export const workspaceApi={
  capabilities:()=>request<Capabilities>('/capabilities'),
  worlds:()=>request<LibraryWorld[]>('/worlds'),
  world:(id:string)=>request<LibraryWorld>('/worlds/'+encodeURIComponent(id)),
  rename:(id:string,name:string)=>request<LibraryWorld>('/worlds/'+encodeURIComponent(id),'PATCH',{name}),
  duplicate:(id:string)=>request<LibraryWorld>('/worlds','POST',{source_id:id}),
  archive:(id:string)=>request<LibraryWorld>(`/worlds/${encodeURIComponent(id)}/archive`,'POST'),
  restore:(id:string)=>request<LibraryWorld>(`/worlds/${encodeURIComponent(id)}/restore`,'POST'),
  preview:(id:string)=>request<components['schemas']['ImportPreview']>(`/worlds/${encodeURIComponent(id)}/preview`),
  generate:(prompt:string,provider:'openai'|'worldlabs',key:string)=>request<Generation>('/generations','POST',{prompt,provider,seed:7,model:'marble-1.1'},{'Idempotency-Key':key}),
  generation:(id:string)=>request<Generation>('/generations/'+encodeURIComponent(id)),
  generations:()=>request<Generation[]>('/generations'),
  retry:(id:string)=>request<Generation>(`/generations/${encodeURIComponent(id)}/retry-retrieval`,'POST'),
  async upload(file:File){
    const r=await fetch(`${API}/v1/workspace/imports?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'X-Workspace-Token':workspaceToken(),'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(60000)});
    const value=await r.json();if(!r.ok)throw new APIError(r.status,value.detail);return value as components['schemas']['ImportResponse'];
  },
  map:(id:string,mapping:components['schemas']['ImportMapping'])=>request<LibraryWorld>(`/imports/${encodeURIComponent(id)}/map`,'POST',mapping),
  resolve:(configuration:Configuration)=>request<Resolved>('/configurations/resolve','POST',configuration),
  save:(configuration:Configuration)=>request<SavedConfiguration>('/configurations','POST',configuration),
  configurations:()=>request<SavedConfiguration[]>('/configurations'),
  start:(id:string,config?:Record<string,unknown>)=>request<{session:components['schemas']['SessionResponse'];session_token:string}>(`/configurations/${encodeURIComponent(id)}/runs`,'POST',{config:config??null}),
  runs:()=>request<Run[]>('/runs'),
  interpret:(prompt:string,environment_id:string)=>request<{proposal:{supported:boolean;explanation:string;configuration:Configuration};provenance:Record<string,unknown>}>('/operations/interpret','POST',{prompt,environment_id}),
};
export type Run={session_id:string;configuration_id:string;created_unix_s:number;provenance:Record<string,unknown>;initial_configuration:{config:Record<string,unknown>};session:components['schemas']['SessionResponse'];experiments:{experiment:components['schemas']['ExperimentResponse'];validation_count:number;successful_validations:number;success_rate:number|null;evaluations:{branch_id:string;evaluation:Record<string,unknown>;performance:Record<string,unknown>}[];energy_joules:null;energy_scope:string}[]};
export const defaultConfiguration=(world='desktop'):Configuration=>({schema_version:'vivacity.configuration/1.0',name:'My robotic experiment',environment_id:world,robot_id:'panda',gripper_id:'panda_parallel',operation_id:'pick_place',seed:7,
  target_position:[.5,-.15,.026],destination_position:[.5,.18,.026],object_half_sizes:[.025,.025,.025],object_mass_kg:.06,object_friction:1,
  sort_property:'mass',sort_threshold:.08,alternate_destination_position:[.5,.35,.026],trial_mode:'adaptive',validation_trials:3,randomization_cycles:1,realtime_speed:1});
