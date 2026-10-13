import {useState} from 'react';
import FactoryView,{type FactoryViewMode} from './FactoryView';
import type {RobotFrame} from './domain';
import './factory.css';

export default function FactoryWorkspace({frame}:{frame:RobotFrame|null}){
 const [mode,setMode]=useState<FactoryViewMode>('fidelity');
 return <section className="factory-workspace">
  <header className="factory-heading"><div><span className="factory-eyebrow">Production research / Cell 01</span><h1>Carton sorting</h1></div><label>View<select value={mode} onChange={e=>setMode(e.target.value as FactoryViewMode)}><option value="fidelity">High fidelity</option><option value="performance">Performance</option></select></label></header>
  <FactoryView frame={frame} mode={mode}/>
  <div className="factory-control-bar"><div><strong>Layout preview</strong><span>Conveyor and production acceptance tests are pending.</span></div><button disabled className="primary">Production unavailable</button></div>
 </section>;
}
