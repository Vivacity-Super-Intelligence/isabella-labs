import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowsClockwise, Check, CheckCircle, CaretDown, Flask, GitBranch, Info, Pause, Play, Robot, SlidersHorizontal, Warning, X } from '@phosphor-icons/react';
import { useRuntime, isBusy } from './useRuntime';
import { usePlayback } from './usePlayback';
import { format, number, robotFrame, scienceObservation, type Backend, type Branch, type Dict, type RobotFrame, type ScienceFrame } from './domain';
import ScienceView from './ScienceView';
const RobotView = lazy(() => import('./RobotView'));

const statusNames: Record<string,string> = { execution_success:'Reach verified', collision_failure:'Collision', planning_failure:'No planned path', joint_limit_failure:'Joint limit', controller_failure:'Controller failure', timeout:'Time limit', fit_completed:'Fit computed', adapter_failure:'Simulator error' };
const label = (b: Branch, i: number) => b.evaluation.hypothesis ? (b.evaluation.hypothesis === 'central_only' ? 'Central body only' : 'Additional influence') : `Branch ${String(i+1).padStart(2,'0')} · ${String(b.action.planner ?? 'candidate').replaceAll('_',' ')}`;
const short = (id?: string) => id?.slice(0,8) ?? '—';

function EnvironmentControls({ backend, config, disabled, apply, close }: { backend: Backend; config: Dict; disabled: boolean; apply:(d:Dict)=>Promise<void>; close:()=>void }) {
  const [position,setPosition] = useState<number[]>(config.obstacle_position as number[] ?? [.45,.04,.22]);
  const [size,setSize] = useState<number[]>(config.obstacle_size as number[] ?? [.055,.13,.22]);
  const [noise,setNoise] = useState(Number(config.noise_std ?? .001));
  const [samples,setSamples] = useState(Number(config.samples ?? 70));
  const [horizon,setHorizon] = useState(Number(config.horizon ?? 5));
  const [scenario,setScenario] = useState('perturbed');
  const submit = async () => {
    await apply(backend === 'mujoco' ? {...config, obstacle_position:position, obstacle_size:size} : {
      ...config, central_mu:1, hidden_mass:scenario==='perturbed'?.12:0, noise_std:noise, samples, horizon
    }); close();
  };
  return <section className="environment-editor" aria-labelledby="environment-heading">
    <div className="section-heading"><h2 id="environment-heading">{backend==='mujoco'?'Change the obstacle':'Observation settings'}</h2><button className="icon-button" onClick={close} aria-label="Close settings"><X size={18} /></button></div>
    {backend==='mujoco' ? <>
      <p>The sliders stage a change. Apply to rebuild the MuJoCo world and compute new alternatives.</p>
      <div className="presets"><button onClick={()=>{setPosition([.45,.04,.22]);setSize([.055,.13,.22]);}}>Original</button><button onClick={()=>{setPosition([.75,-.4,.2]);setSize([.055,.13,.22]);}}>Clear route</button><button onClick={()=>{setPosition([.5,.1,.3]);setSize([.35,.35,.3]);}}>Blocked scene</button></div>
      {['X','Y','Z'].map((axis,i)=><label className="range-field" key={axis}><span>{axis} position <output>{format(position[i],2)} m</output></span><input aria-label={`${axis} obstacle position`} type="range" min={[.15,-.5,.05][i]} max={[.8,.5,.6][i]} step=".01" value={position[i]} onChange={e=>setPosition(p=>p.map((v,j)=>j===i?Number(e.target.value):v))} /></label>)}
      <p className="small">Half-sizes: {size.map(v=>format(v,3)).join(' × ')} m. The target stays fixed.</p>
    </> : <>
      <p>Generate new noisy observations, then fit both hypotheses. Generation parameters are discarded before the fitting policy sees the data.</p>
      <label className="select-field">Observation scenario<select aria-label="Observation scenario" value={scenario} onChange={e=>setScenario(e.target.value)}><option value="perturbed">Perturbed orbit</option><option value="control">No-influence control</option></select></label>
      <label className="range-field"><span>Measurement noise <output>{format(noise,4)}</output></span><input aria-label="Measurement noise" type="range" min=".0001" max=".01" step=".0001" value={noise} onChange={e=>setNoise(Number(e.target.value))} /></label>
      <label className="range-field"><span>Observations <output>{samples}</output></span><input aria-label="Observation count" type="range" min="30" max="200" step="10" value={samples} onChange={e=>setSamples(Number(e.target.value))} /></label>
      <label className="range-field"><span>Time horizon <output>{horizon}</output></span><input aria-label="Time horizon" type="range" min="2" max="8" step=".5" value={horizon} onChange={e=>setHorizon(Number(e.target.value))} /></label>
      <p className="small">Known initial orbit and fixed perturber location. Nondimensional units; synthetic observations.</p>
    </>}
    <button className="primary full" disabled={disabled} onClick={submit}>Apply & run new experiment <ArrowRight size={17} /></button>
  </section>;
}

function BranchEvidence({ branch, robotics }: {branch:Branch;robotics:boolean}) {
  const e=branch.evaluation;
  return <div className="branch-evidence" data-testid="branch-evidence">
    <div className="section-heading"><span className="mono">MEASURED OUTCOME</span><span className={e.success?'positive':'negative'}>{statusNames[e.status]??e.status}</span></div>
    {robotics ? <>
      <dl className="metrics"><div><dt>Goal error</dt><dd>{format(e.goal_error_m!==undefined?e.goal_error_m*1000:undefined,1)} <small>mm</small></dd></div><div><dt>Executed duration</dt><dd>{format(e.execution_duration_s,2)} <small>s</small></dd></div><div><dt>Contacts</dt><dd>{e.contact_violations?.length??'—'}</dd></div><div><dt>Planning feasible</dt><dd>{e.planning_feasible===undefined?'—':e.planning_feasible?'Yes':'No'}</dd></div></dl>
      {e.contact_violations?.length ? <p className="failure-reason">{e.contact_violations.map(c=>`${c.bodies.join(' ↔ ')} (${c.category.replaceAll('_',' ')})`).join('; ')}. Red markers identify involved body origins at the failure frame.</p> : null}
      {e.status==='planning_failure' && <p className="failure-reason">The bounded planner did not produce a feasible path. This branch has no executed movement.</p>}
      {e.failure && <p className="failure-reason">{e.failure}</p>}
    </> : <>
      <dl className="metrics"><div><dt>Training RMSE</dt><dd>{format(e.train_rmse,5)}</dd></div><div><dt>Held-out RMSE</dt><dd>{format(e.heldout_rmse,5)}</dd></div><div><dt>Training BIC</dt><dd>{format(e.training_bic,1)}</dd></div><div><dt>Held-out points</dt><dd>{e.heldout_count??'—'}</dd></div></dl>
      <details className="fit-parameters"><summary>Fitted parameters & uncertainty</summary>{Object.entries(e.parameters??{}).map(([key,value])=><div className="parameter" key={key}><span>{key.replaceAll('_',' ')}</span><strong>{format(value,5)} <small>± {format(e.uncertainty?.standard_errors[key],5)}</small></strong></div>)}
      <p className="small">{e.uncertainty?.caveat??e.failure??'Uncertainty is unavailable.'}</p></details>
    </>}
  </div>;
}

export default function App() {
  const [backend,setBackend]=useState<Backend>(()=>{try{return localStorage.getItem('vivacity:lab')==='scipy'?'scipy':'mujoco';}catch{return 'mujoco';}});
  const rt=useRuntime(backend), robotics=backend==='mujoco';
  const [branchId,setBranchId]=useState<string|null>(null), [recorded,setRecorded]=useState(true), [editing,setEditing]=useState(false);
  const selected=rt.branches.find(b=>b.id===branchId)??rt.branches.find(b=>b.id===rt.experiment?.selected_branch_id)??rt.branches[0];
  const replayBranch=rt.replay?.branches.find(b=>b.branch_id===selected?.id);
  const live=robotFrame(rt.observation);
  const frames=useMemo(()=>(recorded&&replayBranch?replayBranch.frames:live?[live]:[]),[recorded,replayBranch,live]);
  const robotFrames=useMemo(()=>frames.filter(f=>robotFrame(f)) as RobotFrame[],[frames]);
  const play=usePlayback(frames,`${backend}:${rt.experiment?.id}:${selected?.id}:${recorded}:${rt.world?.revision}`);
  const config=(recorded&&rt.replay?rt.replay.config:rt.world?.config)??{};
  const terminal=rt.experiment&&!isBusy(rt.experiment);
  const accepted=terminal&&rt.experiment?.status==='completed'&&!!rt.experiment.selected_branch_id;
  const lastEvent=rt.events.at(-1);
  const status=!rt.online?'Connection lost':rt.mutating?'Updating world':!rt.loaded?'Loading world':!rt.experiment?'Ready':rt.experiment.status==='queued'?'Queued':rt.experiment.status==='running'?(lastEvent?.kind==='planned'?'Simulating':lastEvent?.kind==='branch_completed'?'Evaluating':'Planning'):accepted?'Result selected':rt.experiment.status==='failed'?'Experiment failed':'No feasible result';
  useEffect(()=>{setBranchId(null);setRecorded(true);setEditing(false);},[backend,rt.experiment?.id]);
  const switchLab=(b:Backend)=>{setBackend(b);try{localStorage.setItem('vivacity:lab',b);}catch{/* Storage is optional. */}};
  const mutateWorld=async(kind:'reset'|'commit')=>{play.pause();await rt[kind]();setRecorded(false);};
  const decision=String(rt.experiment?.error??rt.experiment?.result.conclusion??(robotics?'Run an experiment to compare alternative paths through the same initial state.':'Fit both models to the training observations; test predictions on the held-out segment.'));
  const science=useMemo(()=>{
    const archived=rt.replay?.branches.find(b=>b.frames.length&&'observed_position' in b.frames[0]);
    if(!robotics&&recorded&&archived){const f=archived.frames as ScienceFrame[];return {times:f.map(p=>p.time),observations:f.map(p=>p.observed_position),config:rt.replay!.config,selected_model:null};}
    return scienceObservation(rt.observation);
  },[robotics,recorded,rt.replay,rt.observation]);
  const modelHash=String(selected?.initial_state.model_hash??rt.world?.state.model_hash??'Not applicable');
  const disabled=rt.busy||!rt.world||!rt.online;
  return <>
    <a className="skip-link" href="#workspace">Skip to experiment workspace</a>
    <header className="site-header"><a className="brand" href="https://www.tryvivacity.com/" target="_blank" rel="noreferrer" aria-label="Vivacity website"><img src="/vivacity/logo.svg" alt="" width="27" height="27" /><span>vivacity</span></a><span className="header-label mono">EXECUTABLE WORLDS / EXPERIMENT WORKSPACE</span><div className="runtime-status"><i className={rt.online?'online':'offline'} /><span>{rt.online?'Runtime connected':'Runtime offline'}</span><span className="mono">LOCAL</span></div></header>
    <main id="workspace">
      <section className="intro"><div><p className="eyebrow mono">AN EXECUTION RUNTIME FOR AGENTS</p><h1>Give an agent a world.<br /><span>Let it experiment.</span></h1></div><p className="intro-description">Inspect a state. Fork alternatives. <br />Measure what happens. Decide what comes next.<span>Actual physics. Persisted evidence.</span></p></section>
      <div className="workspace-heading"><nav className="lab-tabs" aria-label="Choose laboratory"><button className={robotics?'active':''} aria-pressed={robotics} disabled={rt.mutating} onClick={()=>switchLab('mujoco')}><Robot size={19} /> Robotics Lab <span className="mono">MUJOCO</span></button><button className={!robotics?'active':''} aria-pressed={!robotics} disabled={rt.mutating} onClick={()=>switchLab('scipy')}><Flask size={19} /> Discovery Lab <span className="mono">SCIPY</span></button></nav><div className="world-meta mono">WORLD {short(rt.world?.id)} <span>REV {rt.world?.revision??'—'}</span></div></div>
      {!rt.online&&rt.loaded&&<div className="offline-notice" role="status"><Warning size={19} /><span>Backend unavailable. Saved evidence may remain visible; new experiments require a connection.</span><button onClick={rt.reconnect}>Reconnect</button></div>}
      {rt.error&&<div className="error-notice" role="alert"><Warning size={18} /><span>{rt.error}</span><button onClick={rt.retryAvailable?rt.retry:rt.reconnect} disabled={!rt.online||rt.mutating}>{rt.retryAvailable?'Retry submission':'Reload evidence'}</button><button className="icon-button" aria-label="Dismiss error" onClick={rt.clearError}><X size={17} /></button></div>}
      <div className="workbench">
        <section className="visual-area" aria-label={robotics?'Robot visualization and playback':'Scientific observations and predictions'}>
          {robotics?<Suspense fallback={<div className="viewport-loading">Loading the measured workcell…</div>}><RobotView frames={robotFrames} cursor={play.cursor} config={config} replaying={recorded&&!!replayBranch} playing={play.playing} renderTime={play.time} /></Suspense>:<ScienceView observation={science} branches={rt.branches} selected={selected?.id??null} time={play.time} />}
          <div className="playback-bar"><button className="icon-button playback-button" aria-label={play.playing?'Pause replay':'Play replay'} disabled={!recorded||play.duration===0} onClick={play.toggle}>{play.playing?<Pause size={20} weight="fill" />:<Play size={20} weight="fill" />}</button><span className="mono timecode">{format(play.time,2)} / {format(play.duration,2)} s</span><input aria-label="Replay timeline" type="range" min="0" max={play.duration||1} step="any" value={play.time} disabled={!recorded||!play.duration} onChange={e=>{play.pause();play.seek(Number(e.target.value));}} /><label className="sr-only" htmlFor="playback-speed">Playback speed</label><select id="playback-speed" value={play.speed} onChange={e=>play.setSpeed(Number(e.target.value))}>{[.25,.5,1,2].map(s=><option key={s} value={s}>{s}×</option>)}</select>{robotics&&<button className="text-button" disabled={!replayBranch} onClick={()=>{setRecorded(r=>!r);play.pause();}}>{recorded?'Current state':'Show replay'}</button>}</div>
          <div className="experiment-actions"><button className="primary run-button" disabled={disabled} onClick={()=>{setRecorded(true);rt.run();}}><Play size={17} weight="fill" />{rt.busy?'Experiment running…':'Run experiment'}<span className="mono">{robotics?'REACH TARGET':'FIT HYPOTHESES'}</span></button><button className="secondary" disabled={disabled} onClick={()=>setEditing(e=>!e)}><SlidersHorizontal size={18} />{robotics?'Change obstacle':'Observation settings'}</button><button className="secondary reset-button" disabled={disabled} onClick={()=>mutateWorld('reset')}><ArrowsClockwise size={18} />Reset</button></div>
          <p className="evidence-caption"><CheckCircle size={15} />{robotics?'Menagerie Franka Panda meshes · MuJoCo body transforms · reaching, not grasping':'Synthetic observations · SciPy integration + least-squares fits · predefined hypotheses'}</p>
        </section>
        <aside className="experiment-panel" aria-label="Experiment evidence">
          <div className="problem"><div className="section-heading"><span className="mono">{robotics?'01 / THE PROBLEM':'02 / THE QUESTION'}</span><span className="backend-tag">{rt.world?.simulator_version??'Connecting'}</span></div><h2>{robotics?'Reach the target. Avoid the obstacle.':'The Invisible Planet'}</h2><p>{robotics?'Can the arm reach the blue cube without colliding with the obstacle?':'An observed orbit differs from the central-body model. Could an unseen mass explain the discrepancy?'}</p><div className="goal-note"><Info size={16} /><span>{robotics?'Success: collision-free pre-grasp pose, within 20 mm and 0.08 rad.':'Evidence: predictions on held-out data, with a penalty for unnecessary complexity.'}</span></div></div>
          {editing&&rt.world?<EnvironmentControls key={`${rt.world.revision}:${backend}`} backend={backend} config={rt.world.config} disabled={disabled} apply={rt.apply} close={()=>setEditing(false)} />:<>
            <div className="experiment-progress"><div className="section-heading"><span className="mono">{rt.experiment?`EXPERIMENT ${short(rt.experiment.id)}`:'READY TO EXPERIMENT'}</span><span className={`status-label ${accepted?'positive':terminal?'negative':''}`} aria-live="polite" data-testid="experiment-status">{status}</span></div><ol className="workflow" aria-label="Execution workflow">{['Propose','Simulate','Evaluate','Decide'].map((s,i)=><li key={s} className={rt.experiment?.status==='completed'?'done':isBusy(rt.experiment)&&i===0?'current':''}><span>{terminal?<Check size={12}/>:i+1}</span>{s}</li>)}</ol>{rt.busy&&<p className="small" aria-live="polite">{rt.branches.length} candidate results received. {rt.stream==='live'?'Live events connected.':rt.stream==='reconnecting'?'Reconnecting events; status polling continues.':'Status checked every second.'} The server job continues if you leave this page.</p>}</div>
            <div className="branches-section"><div className="section-heading"><h3>{robotics?'Alternative futures':'Competing hypotheses'}</h3><span className="mono">{rt.branches.length?`${rt.branches.length} BRANCHES`:'—'}</span></div>{!rt.branches.length?<div className="empty-branches"><GitBranch size={25} /><p>{rt.busy?'Computing candidates from the persisted snapshot…':'Each candidate starts from the same independent state. Failed outcomes remain visible.'}</p></div>:rt.branches.map((b,i)=><button key={b.id} className={`branch-row ${selected?.id===b.id?'chosen':''}`} aria-pressed={selected?.id===b.id} data-testid="branch-row" data-status={b.evaluation.status} onClick={()=>{setBranchId(b.id);setRecorded(true);}}><span className={`branch-symbol ${b.evaluation.success?'positive':'negative'}`}>{b.evaluation.success?<CheckCircle size={19}/>:<Warning size={19}/>}</span><span className="branch-main"><strong>{label(b,i)}</strong><span>{statusNames[b.evaluation.status]??b.evaluation.status}</span></span>{rt.experiment?.selected_branch_id===b.id?<span className="selected-tag">SELECTED</span>:<ArrowRight size={15} />}</button>)}</div>
            {selected&&<BranchEvidence branch={selected} robotics={robotics} />}
            <div className={`decision ${terminal?(accepted?'supported':'unsupported'):''}`} data-testid="decision"><span className="mono">DETERMINISTIC {robotics?'PLANNER':'MODEL COMPARISON'}</span><p>{decision}</p>{rt.experiment?.stale&&<p className="stale-warning" data-testid="stale-warning">Recorded revision {rt.experiment.revision}. The world has changed; this result cannot be committed.</p>}{accepted&&<button className="commit-button" disabled={disabled||rt.experiment?.stale} onClick={()=>mutateWorld('commit')}>Commit selected state <ArrowRight size={16} /></button>}{!robotics&&terminal&&<div className="follow-up"><strong>Next experiment</strong><p>Test whether the comparison holds with more observations and lower noise.</p><button disabled={disabled} onClick={()=>rt.apply({...rt.world?.config,central_mu:1,hidden_mass:.12,samples:Math.min(200,Number(rt.world?.config.samples??70)+20),noise_std:Math.max(.00001,Number(rt.world?.config.noise_std??.001)/2)})}>Refine observations <ArrowRight size={14}/></button><span>New perturbed synthetic experiment; deterministic proposal.</span></div>}</div>
          </>}
        </aside>
      </div>
      <div className="inspectors"><details className="inspector"><summary><span><GitBranch size={17} />Technical inspector</span><span className="mono">STATE / ACTION / EVIDENCE <CaretDown size={15}/></span></summary><div className="technical-content"><dl className="metadata"><div><dt>Backend</dt><dd>{backend} {rt.world?.simulator_version}</dd></div><div><dt>Seed / revision</dt><dd>{rt.world?.seed} / {rt.world?.revision}</dd></div><div><dt>World ID</dt><dd>{rt.world?.id??'—'}</dd></div><div><dt>Model hash</dt><dd>{modelHash}</dd></div><div><dt>Job wall / planning / physics</dt><dd>{format(number(rt.experiment?.performance,'job_wall_seconds'),2)} / {format(number(rt.experiment?.performance,'planning_wall_seconds'),2)} / {format(number(rt.experiment?.performance,'physics_wall_seconds'),2)} s</dd></div><div><dt>Simulation steps / integration calls</dt><dd>{String(rt.experiment?.performance.simulation_steps??'—')} / {String(rt.experiment?.performance.integration_calls??'—')}</dd></div><div><dt>Replay payload</dt><dd>{format(number(rt.experiment?.performance,'replay_payload_bytes')!==undefined?Number(rt.experiment?.performance.replay_payload_bytes)/1024:undefined,1)} KiB</dd></div><div><dt>Policy</dt><dd>deterministic · no hosted LLM</dd></div></dl><div className="json-grid"><details><summary>Observed world state</summary><pre>{JSON.stringify(rt.observation,null,2)}</pre></details><details><summary>Candidate action</summary><pre>{JSON.stringify(selected?.action??{},null,2)}</pre></details><details><summary>Evaluation and uncertainty</summary><pre>{JSON.stringify(selected?.evaluation??{},null,2)}</pre></details><details><summary>Runtime measurements</summary><pre>{JSON.stringify(rt.experiment?.performance??{},null,2)}</pre></details></div><div className="history"><h3>Persisted experiment history</h3>{!rt.world?.history.length?<p>No experiments yet.</p>:rt.world.history.slice().reverse().map((id,i)=><button disabled={rt.busy} key={id} onClick={()=>rt.history(id)} className={id===rt.experiment?.id?'active':''}><span>Experiment {rt.world!.history.length-i}</span><span className="mono">{short(id)}</span></button>)}</div></div></details><details className="inspector architecture"><summary><span><Info size={17} />How Vivacity works</span><span className="mono">ONE RUNTIME, TWO WORLDS <CaretDown size={15}/></span></summary><div className="architecture-content"><div className="architecture-flow">Planner <ArrowRight />Vivacity runtime <ArrowRight />{robotics?'MuJoCo physics':'SciPy numerical model'}<ArrowRight />Measured outcomes <ArrowRight />Next decision</div><p>Both labs create a world, observe it, snapshot state, fork independent candidates, apply actions, simulate, evaluate, commit and replay. Each adapter owns its simulator state. The renderer only reads measured transforms or calculated trajectories.</p><p className="small">Local trusted demo. No cancellation or automatic interrupted-job recovery. Optional hosted proposals are server-configured and not exercised by this interface. Science uses a restricted 2D model; it does not discover new physical laws.</p></div></details></div>
    </main>
    <footer><span className="brand-word">vivacity</span><span>Inspectable worlds. Reproducible experiments.</span><a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">API reference <ArrowRight size={14}/></a></footer>
  </>;
}
