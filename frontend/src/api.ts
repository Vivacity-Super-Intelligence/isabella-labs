import type { Backend, World, Experiment, Branch, Replay, Dict, Event } from './domain';
import type { components } from './generated/api';

export const API = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
export class APIError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, init);
  const data = await response.json();
  if (!response.ok) throw new APIError(response.status, data.detail ?? data);
  return data;
}
const json = (method: string, body?: object, headers: Record<string,string> = {}): RequestInit => ({
  method, headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
  ...(body ? { body: JSON.stringify(body) } : {})
});
export const api = {
  health: () => request<{ status: string; backends: Record<string,string> }>('/health'),
  create: (backend: Backend) => request<World>('/v1/worlds', json('POST', { backend, seed: 7 })),
  world: (id: string) => request<World>(`/v1/worlds/${encodeURIComponent(id)}`),
  state: (id: string) => request<components['schemas']['StateResponse']>(`/v1/worlds/${encodeURIComponent(id)}/state`),
  submit: (id: string, key: string, settings: Dict) => request<Experiment>(`/v1/worlds/${id}/experiments`, json('POST', settings, { 'Idempotency-Key': key })),
  experiment: (id: string) => request<Experiment>(`/v1/experiments/${encodeURIComponent(id)}`),
  branches: (id: string) => request<Branch[]>(`/v1/experiments/${encodeURIComponent(id)}/branches`),
  events: (id: string, after=0) => request<Event[]>(`/v1/experiments/${encodeURIComponent(id)}/events?after=${after}`),
  download:async(eid:string,bid:string)=>{
    const response=await fetch(`${API}/v1/experiments/${encodeURIComponent(eid)}/branches/${encodeURIComponent(bid)}/export`);
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
export function errorMessage(error: unknown) {
  if (error instanceof APIError) return `${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
