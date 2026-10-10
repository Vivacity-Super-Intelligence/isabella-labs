import type { components } from './generated/api';

export type Backend = 'mujoco' | 'scipy' | 'cloth';
export type World = components['schemas']['WorldResponse'];
export type Experiment = components['schemas']['ExperimentResponse'];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Dict = Record<string, unknown>;
export interface BodyPose { name: string; position: Vec3; quaternion_wxyz: Quat }
export interface Contact { bodies: string[]; geoms: string[]; penetration_m: number; category: string }
export interface RobotFrame {
  time: number; qpos: number[]; qvel: number[]; ctrl: number[];
  end_effector: Vec3; body_transforms: BodyPose[];
  target_pose: { position: Vec3; rotation_matrix: number[][] }; contacts: Contact[];
}
export interface ScienceFrame {
  time: number; observed_position: number[]; predicted_position: number[];
  predicted_velocity: number[]; split: 'train' | 'heldout';
}
export interface ClothFrame { time:number; vertices:Vec3[]; triangles:number[][]; clamp_position:Vec3; clamp_quaternion_wxyz?:Quat; body_transforms?:BodyPose[]; qpos?:number[]; qvel?:number[]; ctrl?:number[]; grasp_active:boolean[]; scope:string }
export type Frame = RobotFrame | ScienceFrame | ClothFrame;
export interface Evaluation {
  status: string; success: boolean; planning_feasible?: boolean;
  goal_error_m?: number; orientation_error_rad?: number; execution_duration_s?: number;
  joint_path_length_rad?: number;
  milestone?:string; alignment_error_m?:number; vertex_coverage?:number; grasp_valid?:boolean; grasp_constraint_error_m?:number; fold_quality?:number;
  contact_violations?: Contact[]; hypothesis?: string; failure?: string | null;
  parameters?: Record<string, number>; train_rmse?: number; heldout_rmse?: number;
  training_bic?: number; train_count?: number; heldout_count?: number; residuals?: number[][];
  fit_message?: string; phase?: string; error_type?: string;
  uncertainty?: { standard_errors: Record<string, number>; method: string; caveat: string; active_bounds: number[] };
}
export type Branch = Omit<components['schemas']['BranchResponse'], 'evaluation' | 'trace'> & {
  evaluation: Evaluation; trace: Frame[];
};
export interface ReplayBranch { branch_id: string; source: string; frames: Frame[]; evaluation: Evaluation }
export type Replay = Omit<components['schemas']['ReplayResponse'], 'branches'> & { branches: ReplayBranch[] };
// WebSocket envelopes are not part of REST OpenAPI. Matches EventResponse in
// vivacity/schemas.py and the versioned WebSocket contract in docs/API.md.
export interface Event { schema_version:'1.0'; seq:number; kind:'queued'|'running'|'planned'|'progress'|'branch_completed'|'completed'|'failed'; details:Dict }
export interface ScienceObservation { times: number[]; observations: number[][]; config: Dict; selected_model: unknown }
export const format = (n: unknown, digits = 3) => typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
export const number = (d: Dict | undefined, key: string) => typeof d?.[key] === 'number' ? d[key] as number : undefined;
export function robotFrame(value: unknown): RobotFrame | null {
  const v = value as RobotFrame | null;
  return v && Array.isArray(v.body_transforms) && Array.isArray(v.end_effector) ? v : null;
}
export function scienceObservation(value: unknown): ScienceObservation | null {
  const v = value as ScienceObservation | null;
  return v && Array.isArray(v.times) && Array.isArray(v.observations) ? v : null;
}
export function clothFrame(value:unknown):ClothFrame|null {
  const v=value as ClothFrame|null;
  return v&&Array.isArray(v.vertices)&&Array.isArray(v.triangles)?v:null;
}
