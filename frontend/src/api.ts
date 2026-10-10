import type { Backend, World, Experiment, Branch, Replay, Dict } from './domain';
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
