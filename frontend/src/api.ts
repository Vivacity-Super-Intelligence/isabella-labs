import type { Backend, World, Experiment, Branch, Replay, Dict, Event } from './domain';
import type { components } from './generated/api';

export const API = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const pickupTrials = Number(import.meta.env.VITE_PHYSICS_TRIALS ?? 5000);
if (!Number.isInteger(pickupTrials) || pickupTrials < 1 || pickupTrials > 5000) throw new Error('VITE_PHYSICS_TRIALS must be 1..5000');
export const requestedPickupTrials = pickupTrials;
let sessionToken: string | null = null;
export function setSessionToken(token: string) { sessionToken = token; }
export function liveProtocols() { return sessionToken ? ['vivacity.live', `vivacity.token.${sessionToken}`] : []; }
export class APIError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (sessionToken && !headers.has('X-Session-Token')) headers.set('X-Session-Token',sessionToken);
  const response = await fetch(API + path, {...init,headers});
  const data = await response.json();
  if (!response.ok) throw new APIError(response.status, data.detail ?? data);
  return data;
}
const json = (method: string, body?: object, headers: Record<string,string> = {}): RequestInit => ({
  method, headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
  ...(body ? { body: JSON.stringify(body) } : {})
});
const defaultConfig = (backend: Backend): Dict | undefined => backend==='mujoco'
  ? {task:'pick_place',obstacle_enabled:false,obstacle_position:[.75,-.4,.22]} : undefined;
export const api = {
  createSession: async (backend: Backend, token: string, config?: Dict) => {
    const health=await request<{limits?:{max_physics_trials:number}}>('/health');
    const trials=Math.min(pickupTrials,health.limits?.max_physics_trials??pickupTrials);
    return request<components['schemas']['SessionResponse']>('/v1/sessions',json('POST',{
      backend,seed:7,max_cycles:backend==='mujoco'?1:backend==='cloth'?2:4,realtime_execution:true,
      physics_trials:backend==='mujoco'?trials:0,
      search_candidates:backend==='scipy'?0:backend==='mujoco'?trials:5000,physics_budget:3,
      config:config??defaultConfig(backend)
    },{'X-Session-Token':token}));
  },
  session: (id:string) => request<components['schemas']['SessionResponse']>(`/v1/sessions/${encodeURIComponent(id)}`),
  stopSession: (id:string) => request<components['schemas']['SessionResponse']>(`/v1/sessions/${encodeURIComponent(id)}/stop`,json('POST')),
  pauseSession: (id:string) => request<components['schemas']['SessionResponse']>(`/v1/sessions/${encodeURIComponent(id)}/pause`,json('POST')),
  resumeSession: (id:string) => request<components['schemas']['SessionResponse']>(`/v1/sessions/${encodeURIComponent(id)}/resume`,json('POST')),
  live: (id:string) => request<components['schemas']['LiveState']|null>(`/v1/experiments/${encodeURIComponent(id)}/live`),
  health: () => request<{ status: string; backends: Record<string,string>; limits?: {max_physics_trials:number} }>('/health'),
  create: (backend: Backend, config = defaultConfig(backend)) => request<World>('/v1/worlds', json('POST', { backend, seed: 7, config })),
  world: (id: string) => request<World>(`/v1/worlds/${encodeURIComponent(id)}`),
  state: (id: string) => request<components['schemas']['StateResponse']>(`/v1/worlds/${encodeURIComponent(id)}/state`),
  submit: (id: string, key: string, settings: Dict) => request<Experiment>(`/v1/worlds/${id}/experiments`, json('POST', settings, { 'Idempotency-Key': key })),
  experiment: (id: string) => request<Experiment>(`/v1/experiments/${encodeURIComponent(id)}`),
  branches: (id: string) => request<Branch[]>(`/v1/experiments/${encodeURIComponent(id)}/branches`),
  events: (id: string, after=0) => request<Event[]>(`/v1/experiments/${encodeURIComponent(id)}/events?after=${after}`),
  download:async(eid:string,bid:string)=>{
    const response=await fetch(`${API}/v1/experiments/${encodeURIComponent(eid)}/branches/${encodeURIComponent(bid)}/export`,{headers:sessionToken?{'X-Session-Token':sessionToken}:{}});
    if(!response.ok)throw new APIError(response.status,(await response.json()).detail);
    const data=await response.json();
    if(data.schema_version!=='vivacity.branch/1.0'||data.branch_id!==bid||!Array.isArray(data.recorded_frames))throw new Error('Invalid branch export');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`vivacity-${bid}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  replay: (id: string) => request<Replay>(`/v1/experiments/${encodeURIComponent(id)}/replay`),
  environment: (id: string, config: Dict) => request<World>(`/v1/worlds/${id}/environment`, json('PATCH', { config })),
  reset: (id: string) => request<World>(`/v1/worlds/${id}/reset`, json('POST')),
  commit: (id: string, experiment_id: string, branch_id: string) => request<World>(`/v1/worlds/${id}/commit`, json('POST', { experiment_id, branch_id })),
};
export function websocketURL(id: string, after: number) {
  const u = new URL(`/v1/experiments/${encodeURIComponent(id)}/events`, API);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'; u.searchParams.set('after', String(after)); return u.href;
}
export function liveWebsocketURL(id:string) {
  const u=new URL(`/v1/experiments/${encodeURIComponent(id)}/live`,API);
  u.protocol=u.protocol==='https:'?'wss:':'ws:';return u.href;
}
export function errorMessage(error: unknown) {
  if (error instanceof APIError) return `${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
