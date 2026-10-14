import test from 'node:test';
import assert from 'node:assert/strict';
import {factorySettingsIssue} from '../frontend/src/factorySettings.ts';

const factoryDefaults={schema_version:'vivacity.factory-settings/1.0',name:'Carton sorting baseline',seed:19,carton_count:3,carton_mass_kg:.06,carton_friction:.8,carton_half_size_m:.025,carton_start_x_m:.5,carton_start_y_m:-.94,conveyor_speed_m_s:.09,arrival_interval_s:18,realtime_speed:2,sort_threshold_kg:.07,gripper_force_scale:1};

test('accepts a complete production configuration',()=>{
 const settings={...factoryDefaults,carton_mass_kg:.09,carton_friction:1.2,conveyor_speed_m_s:.14};
 assert.equal(factorySettingsIssue(settings),null);
});

test('reports empty numeric input before JSON can turn NaN into null',()=>{
 assert.match(factorySettingsIssue({...factoryDefaults,carton_mass_kg:Number.NaN}),/valid value for Reference mass/);
});

test('rejects settings outside the controls supported range',()=>{
 assert.match(factorySettingsIssue({...factoryDefaults,conveyor_speed_m_s:.5}),/between 0.02 and 0.18/);
 assert.match(factorySettingsIssue({...factoryDefaults,carton_count:1.5}),/whole number/);
 assert.match(factorySettingsIssue({...factoryDefaults,name:'  '}),/configuration name/);
});
