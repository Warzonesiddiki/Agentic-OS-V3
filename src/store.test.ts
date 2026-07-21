import { beforeEach, describe, expect, it } from 'vitest';
import { getState, nexus } from './store';

const memory = (content: string) => ({
  kind: 'semantic' as const,
  title: content,
  content,
  tags: [],
  importance: 0.5,
  source: 'test',
  projectId: null,
});

const skill = {
  name: 'test-skill',
  title: 'Test skill',
  description: 'A deterministic test skill',
  content: 'return true',
  category: 'test',
  tags: [],
  trigger: null,
  source: 'test',
  projectId: null,
};

describe('nexus facade', () => {
  beforeEach(() => nexus.wipe());

  it('creates, updates and deletes memories without mutating prior snapshots', () => {
    const created = nexus.createMemory(memory('first'));
    const before = getState();

    nexus.updateMemory(created.id, { content: 'edited' });
    expect(getState().memories[0]?.content).toBe('edited');
    expect(before.memories[0]?.content).toBe('first');
    expect(before).not.toBe(getState());

    nexus.deleteMemory(created.id);
    expect(getState().memories).toHaveLength(0);
  });

  it('creates and deletes skills', () => {
    const created = nexus.createSkill(skill);
    expect(getState().skills).toHaveLength(1);
    nexus.deleteSkill(created.id);
    expect(getState().skills).toHaveLength(0);
  });

  it('records governance and feedback state', () => {
    nexus.feedback('query', 'memory-1', 'memory', true);
    nexus.killSwitch(true, 'test');

    expect(getState().feedback[0]).toMatchObject({ query: 'query', helpful: true });
    expect(getState().meta.killSwitch).toBe('1');
    expect(getState().meta.killSwitchReason).toBe('test');
  });

  it('captures sessions, checkpoints context and transfers projects', () => {
    const capture = nexus.capture({ transcript: 'Decision: use bounded retries.' });
    expect(capture.distilled || capture.transcriptPreserved).toBe(true);

    const checkpoint = nexus.checkpoint({ label: 'cp1', context: 'checkpoint context' });
    expect(checkpoint.title).toBe('cp1');

    const transfer = nexus.transfer({
      projectName: 'shared',
      memories: [memory('transferred')],
      skills: [],
      files: [],
    });
    expect(transfer.memoriesCreated).toBe(1);
    expect(getState().projects.some((project) => project.name === 'shared')).toBe(true);
  });
});
