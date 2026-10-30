export function pandaTrajectoryCsv(frames:unknown[]):string {
 if(frames.length<2)throw new Error('This result does not contain enough recorded frames.');
 let previous=-Infinity;let previousJoints:number[]|null=null;
 const lines=['time_s,joint1_rad,joint2_rad,joint3_rad,joint4_rad,joint5_rad,joint6_rad,joint7_rad'];
 for(const item of frames){
  if(!item||typeof item!=='object')throw new Error('Invalid recorded frame.');
  const frame=item as {time?:unknown;qpos?:unknown};
  if(typeof frame.time!=='number'||!Number.isFinite(frame.time)||!Array.isArray(frame.qpos)||frame.qpos.length<7||!frame.qpos.slice(0,7).every((q:unknown)=>typeof q==='number'&&Number.isFinite(q)))throw new Error('Joint samples are missing or invalid.');
  const joints=frame.qpos.slice(0,7) as number[];
  if(frame.time===previous&&previousJoints?.every((q,i)=>q===joints[i]))continue;
  if(frame.time<=previous)throw new Error('Joint samples are not time-ordered.');
  previous=frame.time;previousJoints=joints;lines.push([frame.time,...joints].join(','));
 }
 if(lines.length<3)throw new Error('This result does not contain enough distinct recorded frames.');
 return lines.join('\n')+'\n';
}
