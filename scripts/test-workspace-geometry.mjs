import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanPresetGeometry} from '../frontend/src/workspaceGeometry.ts';
test('pickup worlds retain floor and intentional collision fixtures but remove preset furniture',()=>{
 const input={environment:{source:'prebuilt'},physical_operation:'pick_place',scene_geometries:[{name:'floor'},{name:'back_wall'},{name:'rack_left'},{name:'cabinet'},{name:'instrument'},{name:'collision_fixture'}]};
 const actual=cleanPresetGeometry(input);assert.deepEqual(actual.scene_geometries,[{name:'floor'},{name:'collision_fixture'}]);assert.equal(input.scene_geometries.length,6);
});
test('specialized task fixtures are preserved',()=>{
 const input={environment:{source:'prebuilt'},physical_operation:'machine_tending',scene_geometries:[{name:'floor'},{name:'rack_left'},{name:'machine'}]};
 assert.deepEqual(cleanPresetGeometry(input).scene_geometries,[{name:'floor'},{name:'machine'}]);
});
test('custom and imported geometry is preserved',()=>{
 for(const source of ['user','generated','imported']){const input={environment:{source},scene_geometries:[{name:'cabinet'}]};assert.strictEqual(cleanPresetGeometry(input),input);}
});
