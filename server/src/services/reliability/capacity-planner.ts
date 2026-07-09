/** capacity-planner.ts — simple capacity model + headroom forecast. */
export interface CapacityModel {
  service: string;
  currentRps: number;
  maxRps: number;
  growthPerDay: number; // rps/day
}

export function headroomDays(m: CapacityModel): number {
  if (m.growthPerDay <= 0) return Infinity;
  return (m.maxRps - m.currentRps) / m.growthPerDay;
}

export function projectedRps(m: CapacityModel, days: number): number {
  return m.currentRps + m.growthPerDay * days;
}

export function requiresScale(m: CapacityModel, horizonDays = 14): boolean {
  return headroomDays(m) < horizonDays;
}
