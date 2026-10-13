import {API} from './api';
import {fetchRuntime} from './apiTransport';
import {readAPIResponse} from './apiResponse';
import {workspaceToken} from './workspaceApi';
import type {FactoryVisualState} from './FactoryView';

export type FactorySettings={schema_version:string;name:string;seed:number;carton_count:number;carton_mass_kg:number;carton_friction:number;carton_half_size_m:number;conveyor_speed_m_s:number;arrival_interval_s:number;realtime_speed:number;sort_threshold_kg:number;gripper_force_scale:number};
export const factoryDefaults:FactorySettings={schema_version:'vivacity.factory-settings/1.0',name:'Carton sorting baseline',seed:19,carton_count:3,carton_mass_kg:.06,carton_friction:.8,carton_half_size_m:.025,conveyor_speed_m_s:.09,arrival_interval_s:18,realtime_speed:2,sort_threshold_kg:.07,gripper_force_scale:1};
export type FactoryFrame=FactoryVisualState&{cartons:{id:string;position_m:number[];mass_kg:number}[];conveyors:Record<string,{surface_speed_m_s:number;motor_torque_sum_nm:number}>};
export type FactoryCell={id:string;config:FactorySettings;frame:FactoryFrame;last_run_id:string|null};
export type FactoryRun={id:string;cell_id:string;status:string;phase:string;frame:FactoryFrame;error:string|null;config:FactorySettings;events:{time_s:number;kind:string;carton_id?:string}[];metrics:Record<string,number|string>;trace?:FactoryFrame[]};
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetchRuntime(API+'/v1/factory'+path,{method,headers:{'X-Workspace-Token':workspaceToken(),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 return await readAPIResponse(response) as T;
}
export const factoryApi={
 create:(settings:FactorySettings)=>request<FactoryCell>('/cells','POST',settings),
 cell:(id:string)=>request<FactoryCell>('/cells/'+encodeURIComponent(id)),
 start:(id:string,mode:'conveyor'|'production'='production')=>request<FactoryRun>(`/cells/${encodeURIComponent(id)}/runs`,'POST',{mode}),
 run:(id:string)=>request<FactoryRun>('/runs/'+encodeURIComponent(id)),
 record:(id:string)=>request<FactoryRun>(`/runs/${encodeURIComponent(id)}/record`),
 control:(id:string,action:'pause'|'resume'|'stop'|'emergency_stop')=>request<FactoryRun>(`/runs/${encodeURIComponent(id)}/control`,'POST',{action}),
};
