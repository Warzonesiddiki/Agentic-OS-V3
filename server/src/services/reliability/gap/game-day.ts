/** game-day.ts — game-day exercise guide + checklist runner. */
import { ApiError } from '../../../lib/errors.js';

export interface GameDayStep {
  name: string;
  owner: string;
  done: boolean;
}

export interface GameDay {
  id: string;
  title: string;
  objective: string;
  steps: GameDayStep[];
}

const gameDays = new Map<string, GameDay>();

export function plan(
  title: string,
  objective: string,
  steps: { name: string; owner: string }[]
): GameDay {
  const id = 'GD-' + Math.random().toString(36).slice(2, 8);
  const gd: GameDay = { id, title, objective, steps: steps.map((s) => ({ ...s, done: false })) };
  gameDays.set(id, gd);
  return gd;
}

export function completeStep(id: string, stepName: string): GameDay {
  const gd = gameDays.get(id);
  if (!gd) throw new ApiError('GAME_DAY_NOT_FOUND', `No game-day ${id}`);
  const step = gd.steps.find((s) => s.name === stepName);
  if (!step) throw new ApiError('GAME_DAY_STEP_MISSING', `No step ${stepName}`);
  step.done = true;
  return gd;
}

export function readiness(id: string): number {
  const gd = gameDays.get(id);
  if (!gd) throw new ApiError('GAME_DAY_NOT_FOUND', `No game-day ${id}`);
  return gd.steps.filter((s) => s.done).length / Math.max(1, gd.steps.length);
}
