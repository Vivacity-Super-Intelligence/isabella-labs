import { useCallback, useEffect, useRef, useState } from 'react';
import { api, APIError, errorMessage, websocketURL } from './api';
import type { Backend, World, Experiment, Branch, Replay, Event, Dict } from './domain';

const get = (key: string) => { try { return localStorage.getItem(`vivacity:${key}`); } catch { return null; } };
const put = (key: string, value: string) => { try { localStorage.setItem(`vivacity:${key}`, value); } catch { /* UI remains usable without storage. */ } };
const pendingWorlds = new Map<Backend, Promise<World>>();
function ensureWorld(backend: Backend) {
  if (!pendingWorlds.has(backend)) {
    const work = (async () => {
      const stored = get(`${backend}:world`);
      if (stored) { try { return await api.world(stored); } catch (e) { if (!(e instanceof APIError && e.status === 404)) throw e; } }
      const world = await api.create(backend); put(`${backend}:world`, world.id); return world;
    })().finally(() => pendingWorlds.delete(backend));
    pendingWorlds.set(backend, work);
  }
  return pendingWorlds.get(backend)!;
}
export const isBusy = (e: Experiment | null) => e?.status === 'queued' || e?.status === 'running';
export function useRuntime(backend: Backend) {
  const [world, setWorld] = useState<World | null>(null);
  const [observation, setObservation] = useState<Dict | null>(null);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [online, setOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<'connecting' | 'live' | 'reconnecting' | 'idle'>('idle');
  const [epoch, setEpoch] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const retrySubmission = useRef<{ world: string; key: string; settings: Dict } | null>(null);
  const current = useRef(experiment); current.current = experiment;

  useEffect(() => {
    let active = true;
    const health = async () => { try { await api.health(); if (active) setOnline(true); } catch { if (active) setOnline(false); } };
    health(); const id = setInterval(health, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const version = ++generation.current; let active = true;
    setWorld(null); setObservation(null); setExperiment(null); setBranches([]); setReplay(null); setEvents([]); setLoaded(false); setError(null);
    current.current=null;
    retrySubmission.current = null;
    (async () => {
      try {
        const w = await ensureWorld(backend); const state = await api.state(w.id);
        let e: Experiment | null = null;
        const eid = get(`${backend}:experiment`) ?? w.history.at(-1);
        if (eid) { try { const candidate = await api.experiment(eid); if (candidate.world_id === w.id) e = candidate; } catch (err) { if (!(err instanceof APIError && err.status === 404)) throw err; } }
        if (!active || version !== generation.current) return;
        current.current=e;setWorld(w); setObservation(state.observation as Dict); setExperiment(e); setOnline(true); setLoaded(true);
        performance.mark(`vivacity:${backend}:world-ready`);
      } catch (err) { if (active) { setError(errorMessage(err)); setLoaded(true); } }
    })();
    return () => { active = false; };
  }, [backend, epoch]);

  useEffect(() => {
    const id = experiment?.id;
    if (!id) return;
    let active = true, stopped = false, socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null, attempts = 0;
    let cursor = Number(get(`cursor:${id}`) ?? 0), refreshing = false;
    const appendEvents=(incoming:Event[])=>setEvents(old=>[...new Map([...old,...incoming].map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq).slice(-160));
    // Restore recorded logs independently of the reconnect cursor, including finished jobs.
    (async()=>{let after=0;for(let page=0;page<20&&active;page++){const batch=await api.events(id,after);if(active&&current.current?.id===id)appendEvents(batch);if(batch.length<100)break;after=batch.at(-1)!.seq;}})().catch(err=>active&&setError(errorMessage(err)));
    const updateEvidence = async (includeReplay: boolean) => {
      const b = await api.branches(id); const r = includeReplay ? await api.replay(id) : null;
      if (active && current.current?.id===id) { setBranches(b); if (r) setReplay(r); }
    };
    const refresh = async () => {
      if (refreshing || !active) return; refreshing = true;
      try {
        const e = await api.experiment(id);
        if (!active || current.current?.id!==id) return;
        setExperiment(e); setOnline(true);
        if (!isBusy(e)) {
          setStream('idle'); await updateEvidence(true);
          socket?.close();
          const w = await api.world(e.world_id); const s=await api.state(e.world_id);
          if (active && current.current?.id===id) {setWorld(w);setObservation(s.observation as Dict);}
          stopped = true;
        }
      } catch (err) { if (active) setError(`Connection lost. ${errorMessage(err)}. The server job is not cancelled.`); }
      finally { refreshing = false; }
    };
    const connect = () => {
      if (!active || stopped) return;
      setStream(attempts ? 'reconnecting' : 'connecting');
      socket = new WebSocket(websocketURL(id, cursor));
      socket.onopen = () => { if (active && current.current?.id===id) { setStream('live'); attempts = 0; } };
      socket.onmessage = (message) => {
        if (!active || current.current?.id!==id) return;
        try {
          const event = JSON.parse(message.data) as Event;
          if (event.schema_version !== '1.0' || event.seq <= cursor) return;
          cursor = event.seq; put(`cursor:${id}`, String(cursor));
          appendEvents([event]);
          if (event.kind === 'branch_completed') updateEvidence(false).catch(err => active && setError(errorMessage(err)));
          // Keep polling until an authoritative terminal GET completes, including
          // when this event arrives during another in-flight status request.
          if (event.kind === 'completed' || event.kind === 'failed') refresh();
        } catch (err) { setError(`Invalid progress message: ${errorMessage(err)}`); }
      };
      socket.onclose = () => {
        if (!active || current.current?.id!==id) return;
        refresh();
        if (!stopped) { setStream('reconnecting'); timer = setTimeout(connect, Math.min(5000, 500 * 2 ** attempts++)); }
      };
      socket.onerror = () => { if (active && current.current?.id===id && !stopped) setStream('reconnecting'); };
    };
    refresh();
    if (isBusy(experiment)) connect();
    const poll = setInterval(() => { if (!stopped) refresh(); }, 1000);
    return () => { active = false; if (timer) clearTimeout(timer); clearInterval(poll); socket?.close(); };
    // Status changes do not recreate the socket; a new job/lab owns a new effect.
  }, [experiment?.id]);

  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setMutating(true); setError(null);
    try { await operation(); }
    catch (err) { setError(errorMessage(err)); }
    finally { lock.current = false; setMutating(false); }
  }, []);
  const run = useCallback(async (w = world, retry = false) => {
    if (!w || isBusy(current.current)) return;
    const version = generation.current;
    const submission = retry && retrySubmission.current?.world === w.id ? retrySubmission.current : { world: w.id, key: crypto.randomUUID(), settings: { candidates: 3, planner_iterations: 1500, max_simulation_seconds: 25, policy: 'deterministic',...(backend==='mujoco'?{search_candidates:5000,physics_budget:12}:{}) } };
    retrySubmission.current = submission;
    const e = await api.submit(w.id, submission.key, submission.settings);
    put(`${backend}:experiment`, e.id); retrySubmission.current = null;
    if (version !== generation.current) return;
    current.current=e;setExperiment(e); setBranches([]); setReplay(null); setEvents([]);
  }, [backend, world]);
  const refreshWorld = async (w: World) => {
    const state = await api.state(w.id); setWorld(w); setObservation(state.observation as Dict);
    if (current.current) setExperiment(await api.experiment(current.current.id));
  };
  const apply = (config: Dict) => perform(async () => {
    if (!world || isBusy(current.current)) return;
    const w = await api.environment(world.id, config); await refreshWorld(w); await run(w);
  });
  const reset = () => perform(async () => { if (world) await refreshWorld(await api.reset(world.id)); });
  const commit = () => perform(async () => {
    const e = current.current;
    if (world && e?.selected_branch_id) await refreshWorld(await api.commit(world.id, e.id, e.selected_branch_id));
  });
  const history = (id: string) => perform(async () => {
    const e = await api.experiment(id); current.current=e;setExperiment(e); setReplay(null); setBranches([]); setEvents([]); put(`${backend}:experiment`, id);
  });
  return { world, observation, experiment, branches, replay, events, online, loaded, mutating, error, stream,
    busy: mutating || isBusy(experiment), retryAvailable: retrySubmission.current!==null, run: () => perform(() => run()), retry: () => perform(() => run(world, true)),
    apply, reset, commit, history, reconnect: () => setEpoch(e => e+1), clearError: () => setError(null) };
}
