/** oncall.ts — on-call rotation & escalation policy. */
export interface OnCall {
  rotation: { tier: string; members: string[] };
  current: string;
  backup: string;
}

const rotations = new Map<string, OnCall>();

export function setRotation(
  service: string,
  members: string[],
  current: string,
  backup: string
): OnCall {
  const oc: OnCall = { rotation: { tier: service, members }, current, backup };
  rotations.set(service, oc);
  return oc;
}

export function currentFor(service: string): string | undefined {
  return rotations.get(service)?.current;
}

export function escalate(service: string): string | undefined {
  const oc = rotations.get(service);
  if (!oc) return undefined;
  // Promote backup to current; rotate a new backup from the pool.
  const idx = oc.rotation.members.indexOf(oc.backup);
  const nextBackup = oc.rotation.members[(idx + 1) % oc.rotation.members.length] ?? oc.current;
  oc.current = oc.backup;
  oc.backup = nextBackup;
  return oc.current;
}
