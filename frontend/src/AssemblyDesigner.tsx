import {useEffect,useState} from 'react';

type Part={name:string;mesh_file:string;parent_name?:string|null;joint_type:'fixed'|'hinge'|'slide';origin_m:number[];axis:number[];joint_limits:number[];mass_kg:number;longest_dimension_m:number;effort_limit:number;position_gain:number};
type Draft={schema_version:'vivacity.assembly-draft/1.0';name:string;parts:Part[];end_effector_part:string};
const part=(mesh:string,index:number,parent:string|null):Part=>({name:`part_${index+1}`,mesh_file:mesh,parent_name:parent,joint_type:index===0?'fixed':'hinge',origin_m:index===0?[0,0,0]:[.18,0,0],axis:[0,1,0],joint_limits:[-1,1],mass_kg:.2,longest_dimension_m:.2,effort_limit:20,position_gain:50});
const initial=(meshes:string[],saved?:Draft|null):Draft=>saved??{schema_version:'vivacity.assembly-draft/1.0',name:'Imported CAD arm',parts:meshes.slice(0,2).map((mesh,index)=>part(mesh,index,index===0?null:'part_1')),end_effector_part:'part_2'};

export default function AssemblyDesigner({importId,meshes,saved,status,busy,onStage,onCompile}:{importId:string;meshes:string[];saved?:Draft|null;status?:string|null;busy:boolean;onStage:(draft:Draft)=>Promise<boolean>;onCompile:()=>void}){
 const [draft,setDraft]=useState<Draft>(()=>initial(meshes,saved));
 const [dirty,setDirty]=useState(!saved);
 useEffect(()=>{setDraft(initial(meshes,saved));setDirty(!saved);},[importId]);
 const update=(index:number,change:Partial<Part>)=>{setDraft(current=>{
  const oldName=current.parts[index].name,newName=change.name??oldName;
  const parts=current.parts.map((item,i)=>{
   const updated=i===index?{...item,...change}:item;
   return updated.parent_name===oldName&&newName!==oldName?{...updated,parent_name:newName}:updated;
  });
  return {...current,parts,end_effector_part:current.end_effector_part===oldName?newName:current.end_effector_part};
 });setDirty(true);};
 const field=(index:number,label:string,key:'mass_kg'|'longest_dimension_m'|'effort_limit'|'position_gain',min:number,max:number,step:number)=>
  <label>{label}<input type="number" min={min} max={max} step={step} value={draft.parts[index][key]} onChange={event=>update(index,{[key]:Number(event.target.value)})}/></label>;
 return <details className="assembly-designer" open={status!=='compiled'}><summary>Build a jointed robot from separate CAD parts</summary>
  <p>Map each mesh to a link. The server centers each mesh at its link origin, creates bounded collision geometry and test actuators, then compiles the full model in MuJoCo. One unsplit CAD mesh remains a rigid body.</p>
  <label>Assembly name<input value={draft.name} maxLength={80} onChange={event=>{setDraft(value=>({...value,name:event.target.value}));setDirty(true);}}/></label>
  {draft.parts.map((item,index)=><fieldset className="assembly-part" key={index}><legend>Link {index+1} · {index===0?'fixed mount':'moving part'}</legend>
   <label>Link name<input value={item.name} onChange={event=>update(index,{name:event.target.value.replace(/[^A-Za-z0-9_]/g,'')})}/></label>
   <label>CAD mesh<select value={item.mesh_file} onChange={event=>update(index,{mesh_file:event.target.value})}>{meshes.map(mesh=><option key={mesh} value={mesh}>{mesh}</option>)}</select></label>
   {index>0&&<><label>Parent link<select value={item.parent_name??''} onChange={event=>update(index,{parent_name:event.target.value})}>{draft.parts.slice(0,index).map(parent=><option key={parent.name} value={parent.name}>{parent.name}</option>)}</select></label>
    <label>Joint<select value={item.joint_type} onChange={event=>update(index,{joint_type:event.target.value as Part['joint_type']})}><option value="hinge">Hinge</option><option value="slide">Slide</option><option value="fixed">Fixed connection</option></select></label>
    <div className="assembly-vectors">{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>Joint offset {axis} <span>m</span><input type="number" min="-8" max="8" step="0.01" value={item.origin_m[i]} onChange={event=>{const next=[...item.origin_m];next[i]=Number(event.target.value);update(index,{origin_m:next});}}/></label>)}</div>
    {item.joint_type!=='fixed'&&<><label>Axis<select value={item.axis.join(',')} onChange={event=>update(index,{axis:event.target.value.split(',').map(Number)})}><option value="0,0,1">Z axis</option><option value="0,1,0">Y axis</option><option value="1,0,0">X axis</option></select></label>
     <div className="assembly-vectors">{['Minimum','Maximum'].map((label,i)=><label key={label}>{label} <span>{item.joint_type==='hinge'?'rad':'m'}</span><input type="number" min={item.joint_type==='hinge'?-3.14:-1} max={item.joint_type==='hinge'?3.14:1} step="0.1" value={item.joint_limits[i]} onChange={event=>{const next=[...item.joint_limits];next[i]=Number(event.target.value);update(index,{joint_limits:next});}}/></label>)}</div>
     {field(index,`Force limit (${item.joint_type==='hinge'?'N·m':'N'})`,'effort_limit',.1,200,.1)}
     {field(index,'Position gain','position_gain',1,500,1)}</>}
   </>}
   {field(index,'Mass (kg)','mass_kg',.01,10,.01)}
   {field(index,'Longest dimension (m)','longest_dimension_m',.02,1.5,.01)}
  </fieldset>)}
  <label>Tool / gripper attachment link<select value={draft.end_effector_part} onChange={event=>{setDraft(value=>({...value,end_effector_part:event.target.value}));setDirty(true);}}>{draft.parts.map(item=><option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
  <div className="assembly-actions">
   {draft.parts.length<Math.min(8,meshes.length)&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setDraft(value=>({...value,parts:[...value.parts,part(meshes[value.parts.length],value.parts.length,value.parts.at(-1)?.name??null)]}));setDirty(true);}}>Add link</button>}
   {draft.parts.length>2&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setDraft(value=>({...value,parts:value.parts.slice(0,-1)}));setDirty(true);}}>Remove last link</button>}
   <button type="button" className="secondary" disabled={busy||!dirty} onClick={()=>{void onStage(draft).then(saved=>{if(saved)setDirty(false);});}}>Save assembly draft</button>
   <button type="button" className="primary" disabled={busy||dirty||status!=='draft'} onClick={onCompile}>{busy?'Compiling…':'Compile in MuJoCo'}</button>
  </div>
  {status==='compiled'&&<p role="status">Compiled robot ready. Choose a movement, reach, or pick-and-place task below. A visible Vivacity fixture is used for pick-and-place unless the uploaded model supplies a supported gripper controller.</p>}
 </details>;
}
