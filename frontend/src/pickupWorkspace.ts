import type { Vec3 } from './domain';

export const PICKUP_X: readonly [number, number] = [.35, .65];
export const PICKUP_Y: readonly [number, number] = [-.3, .3];
export const MIN_PICKUP_SEPARATION_M = .1;

const clamp = (value: number, [min,max]: readonly [number,number]) => Math.max(min,Math.min(max,value));

export function clampPickupPosition(x: number, y: number, halfSize: number): Vec3 {
  return [clamp(x,PICKUP_X),clamp(y,PICKUP_Y),halfSize+.001];
}

export function pickupSeparationValid(pickup: readonly number[], placement: readonly number[]): boolean {
  return Math.hypot(pickup[0]-placement[0],pickup[1]-placement[1]) >= MIN_PICKUP_SEPARATION_M-1e-9;
}
