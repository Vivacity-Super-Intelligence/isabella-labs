import test from 'node:test';
import assert from 'node:assert/strict';
import {linearFit} from '../frontend/src/roboticsFit.ts';
test('recovers a linear relationship and holds out later samples',()=>{
 const samples=Array.from({length:30},(_,i)=>({time:i/10,value:2+3*i/10}));
 const fit=linearFit(samples);assert.ok(fit);assert.ok(Math.abs(fit.slope-3)<1e-10);assert.ok(fit.rmse<1e-10);assert.equal(fit.testCount,6);
 const shifted=samples.map((p,i)=>i>=24?{...p,value:p.value+1}:p);assert.ok(linearFit(shifted).rmse>.9);
});
test('refuses insufficient or non-varying time samples',()=>{
 const samples=Array.from({length:9},(_,i)=>({time:i,value:i}));assert.equal(linearFit(samples),null);
 assert.equal(linearFit(Array.from({length:12},(_,i)=>({time:0,value:i}))),null);
});
