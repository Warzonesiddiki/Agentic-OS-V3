/** post-mortem.ts — blameless post-mortem records. */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../lib/errors.js';

export interface PostMortem {
  id: string;
  incidentRef: string;
  summary: string;
  timeline: { ts: number; event: string }[];
  rootCause: string;
  actionItems: { owner: string; action: string; due: number }[];
  createdAt: number;
}

const postMortems = new Map<string, PostMortem>();

export function create(incidentRef: string, summary: string): PostMortem {
  const id = 'PM-' + randomUUID().slice(0, 8);
  const pm: PostMortem = {
    id,
    incidentRef,
    summary,
    timeline: [],
    rootCause: '',
    actionItems: [],
    createdAt: Date.now(),
  };
  postMortems.set(id, pm);
  return pm;
}

export function addTimeline(id: string, ts: number, event: string): PostMortem {
  const pm = postMortems.get(id);
  if (!pm) throw new ApiError('PM_NOT_FOUND', `No post-mortem ${id}`);
  pm.timeline.push({ ts, event });
  return pm;
}

export function finalize(
  id: string,
  rootCause: string,
  actionItems: { owner: string; action: string; due: number }[]
): PostMortem {
  const pm = postMortems.get(id);
  if (!pm) throw new ApiError('PM_NOT_FOUND', `No post-mortem ${id}`);
  pm.rootCause = rootCause;
  pm.actionItems = actionItems;
  return pm;
}

export function open(): PostMortem[] {
  return [...postMortems.values()];
}
