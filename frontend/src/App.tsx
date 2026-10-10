import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowsClockwise, DownloadSimple, Pause, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { usePlayback } from './usePlayback';
import { API, api, errorMessage } from './api';
import { format, robotFrame, scienceObservation, type Backend, type RobotFrame, type ScienceFrame } from './domain';
import Settings from './Settings';
import TechnicalInspector from './TechnicalInspector';
import ResultCard from './ResultCard';
const RobotView=lazy(()=>import('./RobotView'));
const ScienceView=lazy(()=>import('./ScienceView'));

export default function App(){
  const [backend,setBackend]=useState<Backend>('mujoco');
  const [page,setPage]=useState<'workspace'|'import'>('workspace');
  const [cloth,setCloth]=useState(false);
  const rt=useRuntime(backend), robotics=backend==='mujoco';
  const [branchId,setBranchId]=useState<string|null>(null),[recorded,setRecorded]=useState(true),[editing,setEditing]=useState(false);
  const [downloadError,setDownloadError]=useState<string|null>(null);
  const compatible=rt.world?.backend===backend;
  const branches=compatible?rt.branches:[];
  const ranked=useMemo(()=>{
    const order=rt.experiment?.result.ranked_branch_ids as string[]|undefined;
    return branches.filter(b=>b.evaluation.success).sort((a,b)=>order?order.indexOf(a.id)-order.indexOf(b.id):Number(b.id===rt.experiment?.selected_branch_id)-Number(a.id===rt.experiment?.selected_branch_id)).slice(0,3);
  },[branches,rt.experiment]);
  const selected=branches.find(b=>b.id===branchId)??branches.find(b=>b.id===rt.experiment?.selected_branch_id)??branches[0];
  const replayBranch=compatible?rt.replay?.branches.find(b=>b.branch_id===selected?.id):undefined;
  const live=compatible?robotFrame(rt.observation):null;
  const frames=useMemo(()=>recorded&&replayBranch?replayBranch.frames:live?[live]:[],[recorded,replayBranch,live]);
  const robotFrames=useMemo(()=>frames.filter(f=>robotFrame(f)) as RobotFrame[],[frames]);
  const play=usePlayback(frames,`${backend}:${rt.experiment?.id}:${selected?.id}:${recorded}:${rt.world?.revision}`,compatible&&recorded&&!!selected?.evaluation.success&&rt.experiment?.status==='completed'&&!rt.experiment.stale);
  const config=(recorded&&rt.replay?.backend===backend?rt.replay.config:compatible?rt.world?.config:{})??{};
  const terminal=compatible&&rt.experiment&&!isBusy(rt.experiment);
  const accepted=terminal&&rt.experiment?.status==='completed'&&!!rt.experiment.selected_branch_id;
  const status=!rt.online?'Connection lost':!rt.loaded?'Loading world':!rt.experiment?'Ready':isBusy(rt.experiment)?rt.experiment.status==='queued'?'Queued':'Experiment running':accepted?'Result selected':rt.experiment.status==='failed'?'Experiment failed':'No feasible result';
  const counters=Object.assign({},...rt.events.filter(e=>e.kind==='progress').map(e=>e.details),rt.experiment?.result.search??{}) as Record<string,unknown>;
  useEffect(()=>{setBranchId(null);setRecorded(true);setEditing(false);},[backend,rt.experiment?.id]);
  const choose=(b:Backend)=>{setBackend(b);setPage('workspace');setCloth(false);try{localStorage.setItem('vivacity:lab',b);}catch{/* Optional storage. */}};
  const disabled=rt.busy||!compatible||!rt.online||cloth;
  const science=useMemo(()=>{
    if(backend!=='scipy'||!compatible)return null;
    const archive=rt.replay?.branches.find(b=>b.frames.length&&'observed_position' in b.frames[0]);
    if(recorded&&archive){const f=archive.frames as ScienceFrame[];return {times:f.map(p=>p.time),observations:f.map(p=>p.observed_position),config:rt.replay!.config,selected_model:null};}
    return scienceObservation(rt.observation);
  },[backend,compatible,recorded,rt.replay,rt.observation]);
  return <>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="site-header"><a className="brand" href="https://www.tryvivacity.com/" target="_blank" rel="noreferrer" aria-label="Vivacity website"><img src="/vivacity/logo.svg" alt="" width="27" height="27"/><span>vivacity</span></a><nav className="main-nav" aria-label="Choose laboratory"><button aria-pressed={page==='workspace'&&robotics} disabled={rt.mutating} onClick={()=>choose('mujoco')}>Robotics</button><button aria-pressed={page==='workspace'&&!robotics} disabled={rt.mutating} onClick={()=>choose('scipy')}>Discovery</button><button aria-pressed={page==='import'} onClick={()=>setPage('import')}>Import World</button></nav></header>
    <main id="workspace">
      {page==='import'?<section className="import-area"><h1>Bring your world.</h1><p>Validated visual and simulation import is being implemented. Existing worlds remain available.</p><button className="secondary" onClick={()=>choose('mujoco')}>Return to Robotics</button></section>:<>
        <div className="workspace-intro"><div>{robotics&&<nav className="world-switch" aria-label="Robotics world"><button aria-pressed={!cloth} onClick={()=>setCloth(false)}>Object Pickup</button><button aria-pressed={cloth} onClick={()=>setCloth(true)}>Cloth Folding</button></nav>}<h1>{robotics?(cloth?'Find a feasible way to fold a cloth.':'Reach the object. Avoid the obstacle.'):'The Invisible Planet'}</h1><p>{robotics?(cloth?'Deformable physics benchmark is not yet available.':'Pickup milestone: pre-grasp reach. Grasp, lift and placement are not implemented.'):'Can an unseen gravitational influence explain the observed orbit?'}</p></div><span className="connection" role="status">{rt.online?'Viva Physics connected':'Runtime offline'}</span></div>
        {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={18}/><span>Simulation runtime unavailable. Recorded results remain inspectable.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
        {rt.error&&<div className="error-notice" role="alert"><Warning size={18}/><span>{rt.error}</span><button onClick={rt.retryAvailable?rt.retry:rt.reconnect} disabled={!rt.online||rt.mutating}>{rt.retryAvailable?'Retry submission':'Reload evidence'}</button><button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17}/></button></div>}
        <div className="workbench">
          <section className="visual-area" aria-label="Simulation and replay"><div onPointerDownCapture={play.pause} onKeyDownCapture={play.pause}>
            {cloth?<div className="viewport-loading">Physical cloth benchmark pending.</div>:robotics?<Suspense fallback={<div className="viewport-loading">Loading workcell…</div>}><RobotView frames={robotFrames} cursor={play.cursor} config={config} replaying={recorded&&!!replayBranch} playing={play.playing} renderTime={play.time}/></Suspense>:<Suspense fallback={<div className="viewport-loading">Loading discovery…</div>}><ScienceView observation={science} branches={branches} selected={selected?.id??null} time={play.time}/></Suspense>}
            </div><div className="playback-bar"><button className="icon-button" aria-label={play.playing?'Pause motion':'Resume motion'} disabled={!play.duration} onClick={play.toggle}><Pause size={18}/></button><span className="timecode mono">{format(play.time,2)} / {format(play.duration,2)} s</span><input aria-label="Replay timeline" type="range" min="0" max={play.duration||1} step="any" value={play.time} disabled={!recorded||!play.duration} onChange={e=>{play.pause();play.seek(Number(e.target.value));}}/><label className="sr-only" htmlFor="playback-speed">Playback speed</label><select id="playback-speed" value={play.speed} onChange={e=>play.setSpeed(Number(e.target.value))}>{[.25,.5,1,2].map(s=><option key={s} value={s}>{s}×</option>)}</select></div>
            <div className="experiment-actions"><button className="primary run-button" disabled={disabled} onClick={()=>{setRecorded(true);rt.run();}}>{rt.busy?'Experiment running…':'Run experiment'}<ArrowRight size={18}/></button><button className="secondary" disabled={disabled} onClick={()=>setEditing(e=>!e)}><SlidersHorizontal size={18}/>{robotics?'Change obstacle':'Observation settings'}</button><button className="secondary" disabled={disabled} onClick={async()=>{play.pause();await rt.reset();setRecorded(false);}}><ArrowsClockwise size={18}/>Reset</button></div>
          </section>
          <aside className="results" aria-label="Verified results">
            <div className="section-heading"><h2>{robotics?'Best verified paths':'Hypotheses'}</h2><span className="status-label" data-testid="experiment-status" aria-live="polite">{status}</span></div>
            {editing&&rt.world?<Settings key={`${backend}:${rt.world.revision}`} backend={backend} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)}/>:<>
              {!ranked.length?<p className="results-empty">{cloth?'No cloth execution is available yet.':rt.busy?'Searching and validating independent alternatives…':terminal?'No feasible candidate. Failures are recorded below.':'Run an experiment to measure alternatives from the same initial state.'}</p>:ranked.map((b,i)=><ResultCard key={b.id} branch={b} rank={i} selected={b.id===selected?.id} robotics={robotics} choose={()=>{setBranchId(b.id);setRecorded(true);}} download={()=>{setDownloadError(null);api.download(b.experiment_id,b.id).catch(e=>setDownloadError(errorMessage(e)));}}/>)}

              {downloadError&&<p role="alert" className="negative">{downloadError}</p>}
              <p className="decision" data-testid="decision">{compatible?String(rt.experiment?.error??rt.experiment?.result.conclusion??'') : ''}</p>
              {rt.experiment?.stale&&<p className="stale-warning" data-testid="stale-warning">The world changed. This recorded result cannot be committed.</p>}
              {accepted&&<button className="text-button" disabled={disabled||rt.experiment?.stale} onClick={async()=>{play.pause();await rt.commit();setRecorded(false);}}>Commit selected state <ArrowRight size={15}/></button>}
              {!robotics&&selected&&<details className="fit-parameters"><summary>Fitted parameters & uncertainty</summary>{Object.entries(selected.evaluation.parameters??{}).map(([k,v])=><p key={k}>{k.replaceAll('_',' ')}: {format(v,5)} ± {format(selected.evaluation.uncertainty?.standard_errors[k],5)}</p>)}<p className="small">{selected.evaluation.uncertainty?.caveat}</p></details>}
            </>}
          </aside>
        </div>
        {robotics&&counters.generated!==undefined&&<dl className="search-counts" aria-label="Actual search work">{[['Generated','generated'],['Screened','screened'],['Rejected by screening','rejected'],['Physics rollouts','fully_simulated'],['Verified feasible','verified_feasible']].map(([name,key])=><div key={key}><dt>{name}</dt><dd data-testid={`count-${key}`}>{Number(counters[key]??0).toLocaleString()}</dd></div>)}</dl>}
        <TechnicalInspector events={rt.events} initialized={compatible} playing={play.playing} branches={branches} select={id=>{setBranchId(id);setRecorded(true);}} history={{ids:rt.world?.history??[],open:rt.history,disabled:rt.busy}}/>
      </>}
    </main>
    <footer><span>Viva Physics</span><details><summary>Credits & scope</summary><p>Vivacity interface. Robotics: MuJoCo and Menagerie Franka Panda (Apache 2.0). Science: SciPy, simplified 2D dynamics and synthetic observations. Deterministic policy; no hosted LLM reasoning.</p></details><a href={`${API}/docs`} target="_blank" rel="noreferrer">API reference <ArrowRight size={14}/></a></footer>
  </>;
}
