import { describe, it, expect } from 'vitest';

function topicMatchSegments(p: string[], t: string[]): boolean {
  let pi = 0;
  for (let ti = 0; ti < t.length; ti++) {
    if (pi >= p.length) return false;
    if (p[pi] === "**") return true;
    if (p[pi] === "*" || p[pi] === t[ti]) { pi++; continue; }
    return false;
  }
  return pi === p.length;
}

describe('matcher', () => {
  it('** matches', () => {
    expect(topicMatchSegments('metrics/agent/**'.split('/'), 'metrics/agent/cpu'.split('/'))).toBe(true);
  });
});
