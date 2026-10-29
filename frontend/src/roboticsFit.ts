export type Point={time:number;value:number};
export function linearFit(points:Point[]){
 const clean=points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)).sort((a,b)=>a.time-b.time);
 if(clean.length<10)return null;
 const n=Math.max(2,Math.floor(clean.length*.8)),training=clean.slice(0,n),test=clean.slice(n);
 const t0=training[0].time,meanT=training.reduce((s,p)=>s+p.time-t0,0)/n,meanY=training.reduce((s,p)=>s+p.value,0)/n;
 const variance=training.reduce((s,p)=>s+(p.time-t0-meanT)**2,0);if(variance<1e-12||!test.length)return null;
 const slope=training.reduce((s,p)=>s+(p.time-t0-meanT)*(p.value-meanY),0)/variance,intercept=meanY-slope*meanT;
 const predict=(time:number)=>intercept+slope*(time-t0),rmse=Math.sqrt(test.reduce((s,p)=>s+(p.value-predict(p.time))**2,0)/test.length);
 return {t0,slope,intercept,rmse,trainCount:n,testCount:test.length,predict};
}
