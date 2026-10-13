import {API} from './api';
import {fetchRuntime} from './apiTransport';
import {readAPIResponse} from './apiResponse';
import {workspaceToken} from './workspaceApi';
import type {FactoryVisualState,FactoryGeometry} from './FactoryView';

export type FactorySettings={schema_version:string;name:string;seed:number;carton_count:number;carton_mass_kg:number;carton_friction:number;carton_half_size_m:number;carton_start_x_m:number;carton_start_y_m:number;conveyor_speed_m_s:number;arrival_interval_s:number;realtime_speed:number;sort_threshold_kg:number;gripper_force_scale:number};
export const factoryDefaults:FactorySettings={schema_version:'vivacity.factory-settings/1.0',name:'Carton sorting baseline',seed:19,carton_count:3,carton_mass_kg:.06,carton_friction:.8,carton_half_size_m:.025,carton_start_x_m:.5,carton_start_y_m:-.94,conveyor_speed_m_s:.09,arrival_interval_s:18,realtime_speed:2,sort_threshold_kg:.07,gripper_force_scale:1};
export type FactoryFrame=FactoryVisualState&{measurements:FactoryMeasurements;qvel:number[];end_effector:number[];cartons:{id:string;position_m:number[];quaternion_wxyz:number[];linear_velocity_m_s:number[];angular_velocity_rad_s:number[];mass_kg:number}[];conveyors:Record<string,{surface_speed_m_s:number;motor_torque_sum_nm:number}>};
export type FactoryCell={id:string;config:FactorySettings;frame:FactoryFrame;collision_geometry:FactoryGeometry[];last_run_id:string|null};
export type FactoryRun={id:string;cell_id:string;status:string;phase:string;frame:FactoryFrame;error:string|null;config:FactorySettings;events:{time_s:number;kind:string;carton_id?:string}[];metrics:Record<string,number|string>;trace?:FactoryFrame[]};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetchRuntime(API+'/v1/factory'+path,{method,headers:{'X-Workspace-Token':workspaceToken(),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 return await readAPIResponse(response) as T;
}
export type BenchmarkInput={schema_version?:string;name:string;repeats:number;held_out_repeats:number;changes:{carton_mass_kg?:number;carton_friction?:number;gripper_force_scale?:number;conveyor_speed_m_s?:number}};
export type FactoryImport={cell:FactoryCell;benchmark_request:BenchmarkInput|null;receipt_id:string;message:string};
export const factoryApi={
 exportConfiguration:(id:string)=>request<unknown>(`/cells/${encodeURIComponent(id)}/export`),
 exportBenchmark:(id:string)=>request<unknown>(`/benchmarks/${encodeURIComponent(id)}/export`),
 exportRecord:(id:string)=>request<unknown>(`/runs/${encodeURIComponent(id)}/export`),
 importConfiguration:(value:unknown)=>request<FactoryImport>('/imports','POST',value),
 history:()=>request<FactoryRun[]>('/runs'),
 benchmarks:()=>request<FactoryBenchmarkRecord[]>('/benchmarks'),
 benchmark:(id:string)=>request<FactoryBenchmarkRecord>('/benchmarks/'+encodeURIComponent(id)),
 startBenchmark:(id:string,settings:{name:string;repeats:number;held_out_repeats:number;changes:Record<string,number>})=>request<FactoryBenchmarkRecord>(`/cells/${encodeURIComponent(id)}/benchmarks`,'POST',settings),
 benchmarkControl:(id:string,action:'pause'|'resume'|'stop')=>request<FactoryBenchmarkRecord>(`/benchmarks/${encodeURIComponent(id)}/control`,'POST',{action}),
 samples:(id:string,after=-1)=>request<{frames:FactoryFrame[];next_index:number;total_samples:number;status:string}>(`/runs/${encodeURIComponent(id)}/samples?after=${after}`),
 observation:(id:string)=>request<FactoryObservationRecord>(`/cells/${encodeURIComponent(id)}/observation`),
 create:(settings:FactorySettings)=>request<FactoryCell>('/cells','POST',settings),
 cell:(id:string)=>request<FactoryCell>('/cells/'+encodeURIComponent(id)),
 start:(id:string,mode:'conveyor'|'production'='production')=>request<FactoryRun>(`/cells/${encodeURIComponent(id)}/runs`,'POST',{mode}),
 run:(id:string)=>request<FactoryRun>('/runs/'+encodeURIComponent(id)),
 record:(id:string)=>request<FactoryRun>(`/runs/${encodeURIComponent(id)}/record`),
 control:(id:string,action:'pause'|'resume'|'stop'|'emergency_stop')=>request<FactoryRun>(`/runs/${encodeURIComponent(id)}/control`,'POST',{action}),
};

export type FactoryObservationRecord={ground_truth:FactoryFrame;camera:{time_s:number;image_data_url:string;width_px:number;height_px:number;method:string;centre_assumption:string;detections:{id:string;detected:boolean;visibility:string;visible_pixels:number;bbox_xyxy_px:number[]|null;estimated_center_m:number[]|null}[]}};

export type FactoryMeasurements={state_time_s:number;dynamics_time_s:number;robot:{joint_position_rad:number[];joint_velocity_rad_s:number[];joint_acceleration_rad_s2:number[];joint_torque_nm:number[];gripper_contact_normal_force_n:number};objects:{id:string;center_of_mass_m:number[];mass_kg:number;principal_inertia_kg_m2:number[];friction:number[];linear_acceleration_m_s2:number[];kinetic_energy_j:number;potential_energy_j:number;contact_count:number}[];contacts:{bodies:string[];position_m:number[];normal_force_n:number;force_on_geom2_world_n:number[]}[];actuator_power_w:number;robot_actuator_power_w:number;mechanical_work_j:number;positive_actuator_work_j:number;robot_mechanical_work_j:number;electrical_energy_j:null;scope:string};

export type BenchmarkGroup={trials:number;successes:number;success_rate:number|null;successful_duration_mean_s:number|null;successful_duration_variance_s2:number|null;failures:Record<string,number>};
export type FactoryBenchmarkRecord={id:string;name:string;status:string;phase:string;total_trials:number;active_phase?:string;active_time_s?:number;active_frame?:FactoryFrame|null;error:string|null;trials:{run_id:string;partition:string;condition:string;config:FactorySettings;status:string;failure_kind:string|null;metrics:FactoryRun['metrics'];error:string|null}[];comparison:{selected_condition?:string|null;selection_reason?:string;scope?:string;partitions?:Record<string,Record<string,BenchmarkGroup>>}};
