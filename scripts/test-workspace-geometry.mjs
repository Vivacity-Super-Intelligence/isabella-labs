import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutPresetBackWall} from '../frontend/src/workspaceGeometry.ts';
test('only the predefined backdrop is removed from the physical configuration',()=>{
 const input={environment:{source:'prebuilt'},scene_geometries:[{name:'floor'},{name:'back_wall'},{name:'rack_left'}]};
 const actual=withoutPresetBackWall(input);assert.deepEqual(actual.scene_geometries,[{name:'floor'},{name:'rack_left'}]);assert.equal(input.scene_geometries.length,3);
});
test('custom and imported geometry is preserved',()=>{
 for(const source of ['user','generated','imported']){const input={environment:{source},scene_geometries:[{name:'back_wall'}]};assert.strictEqual(withoutPresetBackWall(input),input);}
});
