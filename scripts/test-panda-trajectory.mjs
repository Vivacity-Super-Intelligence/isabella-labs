import test from 'node:test';import assert from 'node:assert/strict';import {pandaTrajectoryCsv} from '../frontend/src/pandaTrajectory.ts';
test('exports seven measured joints with ordered simulation times',()=>{const s=pandaTrajectoryCsv([{time:0,qpos:[1,2,3,4,5,6,7,8]},{time:.1,qpos:[2,3,4,5,6,7,8,9]}]);assert.equal(s,'time_s,joint1_rad,joint2_rad,joint3_rad,joint4_rad,joint5_rad,joint6_rad,joint7_rad\n0,1,2,3,4,5,6,7\n0.1,2,3,4,5,6,7,8\n');});
test('rejects missing, non-finite, and unordered samples',()=>{assert.throws(()=>pandaTrajectoryCsv([]));assert.throws(()=>pandaTrajectoryCsv([{time:1,qpos:[1,2,3,4,5,6,NaN]},{time:2,qpos:[1,2,3,4,5,6,7]}]));assert.throws(()=>pandaTrajectoryCsv([{time:1,qpos:[1,2,3,4,5,6,7]},{time:1,qpos:[1,2,3,4,5,6,7]}]));});

test('removes only identical duplicate terminal samples',()=>{const q=[1,2,3,4,5,6,7];const s=pandaTrajectoryCsv([{time:0,qpos:q},{time:1,qpos:q},{time:1,qpos:q}]);assert.equal(s.trim().split('\n').length,3);});
