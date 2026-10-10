import { useState } from 'react';
import { ArrowRight, X } from '@phosphor-icons/react';
import { format, type Backend, type Dict } from './domain';
export default function Settings({ backend, config, disabled, apply, close }: { backend: Backend; config: Dict; disabled: boolean; apply:(d:Dict)=>Promise<void>; close:()=>void }) {
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
      <p>The sliders stage a change. Apply to rebuild the physical world and compute new alternatives.</p>
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

