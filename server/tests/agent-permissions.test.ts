/**
 * agent-permissions.test.ts — Phase 13 hardening:
 *  deny-precedence, wildcard scope, role templates, audit-on-deny.
 *  agent-runtime is unmocked; lib/audit + lib/errors are mocked so no DB/HTTP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const appendAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../src/lib/audit.js', () => ({ appendAudit }));
vi.mock('../src/lib/errors.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      msg: string
    ) {
      super(msg);
      this.name = 'ApiError';
    }
  },
}));

import {
  grant,
  deny,
  revokeAll,
  hasPermission,
  assertPermission,
  listPermissions,
  applyRole,
  defineRole,
} from '../src/services/agent-permissions.js';

beforeEach(() => {
  vi.clearAllMocks();
  // reset module state by revoking everything referenced in tests
  for (const id of ['agent-a', 'agent-b', 'agent-c']) revokeAll(id);
  defineRole('orchestrator', ['agent:spawn', 'agent:read', 'agent:write']);
});

describe('agent-permissions — allow/deny precedence', () => {
  it('grants an explicitly allowed scope', () => {
    grant('agent-a', 'agent:read');
    expect(hasPermission('agent-a', 'agent:read')).toBe(true);
  });

  it('denies a scope with no grant', () => {
    expect(hasPermission('agent-a', 'agent:write')).toBe(false);
  });

  it('DENY always wins over ALLOW (explicit bar)', () => {
    grant('agent-b', 'agent:read');
    deny('agent-b', 'agent:read');
    expect(hasPermission('agent-b', 'agent:read')).toBe(false);
  });

  it('wildcard deny overrides a specific allow', () => {
    grant('agent-b', 'agent:read');
    deny('agent-b', 'agent:*');
    expect(hasPermission('agent-b', 'agent:read')).toBe(false);
  });
});

describe('agent-permissions — wildcard scopes', () => {
  it('prefix:* grants every scope under that prefix', () => {
    grant('agent-a', 'agent:*');
    expect(hasPermission('agent-a', 'agent:read')).toBe(true);
    expect(hasPermission('agent-a', 'agent:write')).toBe(true);
  });

  it('specific deny beats a wildcard allow', () => {
    grant('agent-a', 'agent:*');
    deny('agent-a', 'agent:delete');
    expect(hasPermission('agent-a', 'agent:delete')).toBe(false);
    expect(hasPermission('agent-a', 'agent:read')).toBe(true);
  });
});

describe('agent-permissions — role templates', () => {
  it('applyRole seeds the template scopes into allow', () => {
    applyRole('agent-c', 'orchestrator');
    expect(hasPermission('agent-c', 'agent:spawn')).toBe(true);
    expect(hasPermission('agent-c', 'agent:read')).toBe(true);
    expect(hasPermission('agent-c', 'agent:unknown')).toBe(false);
  });
});

describe('agent-permissions — audit on decision', () => {
  it('assertPermission throws ApiError AND audits the denial when lacking scope', () => {
    expect(() => assertPermission('agent-a', 'agent:write')).toThrow(/lacks scope/);
    expect(appendAudit).toHaveBeenCalledWith(
      'agent.permissions.denied',
      { agentId: 'agent-a', scope: 'agent:write' },
      'agent-a'
    );
  });

  it('assertPermission audits the allow path on success', () => {
    grant('agent-a', 'agent:read');
    expect(() => assertPermission('agent-a', 'agent:read')).not.toThrow();
    expect(appendAudit).toHaveBeenCalledWith(
      'agent.permissions.allowed',
      { agentId: 'agent-a', scope: 'agent:read' },
      'agent-a'
    );
  });
});

describe('agent-permissions — listing & revoke', () => {
  it('lists allow and deny entries (deny prefixed with !)', () => {
    grant('agent-a', 'agent:read');
    deny('agent-a', 'agent:delete');
    const list = listPermissions('agent-a');
    expect(list).toContain('agent:read');
    expect(list).toContain('!agent:delete');
  });

  it('revokeAll wipes both allow and deny', () => {
    grant('agent-a', 'agent:read');
    deny('agent-a', 'agent:delete');
    revokeAll('agent-a');
    expect(hasPermission('agent-a', 'agent:read')).toBe(false);
    expect(listPermissions('agent-a')).toEqual([]);
  });
});
