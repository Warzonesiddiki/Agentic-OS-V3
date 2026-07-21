import { describe, expect, it } from 'vitest';
import { InMemoryR1Repositories } from '@agentic-os/sdk';
import { createR1Runtime } from '../src/services/r1-runtime.js';

describe('R1 server runtime composition', () => {
  it('composes the shared service with an injected repository adapter', async () => {
    const runtime = createR1Runtime(new InMemoryR1Repositories(), {
      now: () => '2026-07-21T00:00:00.000Z',
    });
    expect(runtime.repositories).toBeDefined();
    expect(runtime.service).toBeDefined();
    await expect(runtime.service.getProject('44444444-4444-4444-8444-444444444444'))
      .resolves.toBeNull();
  });
});
