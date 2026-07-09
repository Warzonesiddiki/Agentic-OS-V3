/**
 * Sentinel core unit tests — pure logic, no database required.
 * Covers the deepened security/reliability modules in Sentinel's namespace.
 */
import { describe, it, expect } from 'vitest';
import { setPolicy, checkEgress, NetworkPolicyEngine } from '../src/services/network-policy.js';
import {
  scanContent,
  hasSecret,
  scanSecrets,
  redactSecrets,
} from '../src/services/secrets-scanner.js';
import { computePostureFrom, ratingFor } from '../src/services/security-posture.js';
import { RuntimeSecurityGuard, scoreCode } from '../src/services/runtime-security.js';
import { scoreEvents, RansomwareDetector } from '../src/services/ransomware-detector.js';
import {
  FailureInjectionHarness,
  FailureInjectionRequest,
} from '../src/services/reliability/failure-injection.js';
import { evaluateDrift, AuditDriftConfig } from '../src/services/audit-drift.js';

describe('network-policy (contract + engine)', () => {
  it('denies egress with no policy (fail closed)', () => {
    expect(() => checkEgress('agent-x', 'evil.com')).toThrow();
  });

  it('allows only hosts in allowEgress', () => {
    setPolicy({ agentId: 'a1', allowEgress: ['api.github.com'], denyEgress: [] });
    expect(checkEgress('a1', 'api.github.com')).toBe(true);
    expect(() => checkEgress('a1', 'evil.com')).toThrow();
  });

  it('denyEgress takes precedence', () => {
    setPolicy({ agentId: 'a2', allowEgress: ['x.com'], denyEgress: ['x.com'] });
    expect(() => checkEgress('a2', 'x.com')).toThrow();
  });

  it('advanced engine supports CIDR + port scoping', () => {
    const eng = new NetworkPolicyEngine();
    eng.setRules([
      { id: 'r1', direction: 'egress', effect: 'allow', cidr: '10.0.0.0/8', ports: ['443'] },
      { id: 'r2', direction: 'egress', effect: 'deny', host: '*', denySeverity: 'high' },
    ]);
    expect(eng.evaluate({ host: '10.1.2.3', port: 443 }, 'egress').allowed).toBe(true);
    expect(eng.evaluate({ host: '10.1.2.3', port: 80 }, 'egress').allowed).toBe(false);
    expect(eng.evaluate({ host: '8.8.8.8', port: 443 }, 'egress').allowed).toBe(false);
  });
});

describe('secrets-scanner', () => {
  it('detects a GitHub PAT regardless of entropy', () => {
    const text = 'token ghp_' + 'a'.repeat(36);
    expect(hasSecret(text)).toBe(true);
    const m = scanContent(text);
    expect(m.some((x) => x.ruleId === 'github-pat')).toBe(true);
  });

  it('returns empty for benign code', () => {
    expect(scanContent('normal code here').length).toBe(0);
    expect(hasSecret('normal code here')).toBe(false);
  });

  it('detects AWS key, Stripe key, and JWT', () => {
    expect(hasSecret('AKIA' + 'B'.repeat(16))).toBe(true);
    expect(hasSecret('sk_live_' + 'c'.repeat(24))).toBe(true);
    expect(
      hasSecret(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      )
    ).toBe(true);
  });

  it('masks and redacts secrets', () => {
    const redacted = redactSecrets('key=sk_live_' + 'c'.repeat(24));
    expect(redacted).not.toContain('sk_live_' + 'c'.repeat(24));
    expect(redacted).toContain('****');
  });

  it('suppresses example/dummy values', () => {
    expect(
      scanSecrets('const key = "example_key_1234567890abcdef";', { skipEntropy: true }).some(
        (m) => m.ruleId === 'generic-api-key-assign'
      )
    ).toBe(false);
  });
});

describe('security-posture', () => {
  it('maps score to rating bands', () => {
    expect(ratingFor(95)).toBe('strong');
    expect(ratingFor(70)).toBe('elevated');
    expect(ratingFor(50)).toBe('at_risk');
    expect(ratingFor(20)).toBe('critical');
  });

  it('computes a composite from inputs', () => {
    const r = computePostureFrom({
      auditFailures: 0,
      activeAnomalies: 0,
      openIncidents: 0,
      maxIncidentSeverity: 0,
      siemHealthy: 1,
      siemTotal: 1,
      secretFindings: 0,
      breachEvents: 0,
    });
    expect(r.score).toBe(100);
    expect(r.rating).toBe('strong');
  });

  it('penalizes open incidents and unhealthy SIEM', () => {
    const r = computePostureFrom({
      auditFailures: 0,
      activeAnomalies: 2,
      openIncidents: 3,
      maxIncidentSeverity: 3,
      siemHealthy: 0,
      siemTotal: 2,
      secretFindings: 1,
      breachEvents: 0,
    });
    expect(r.score).toBeLessThan(100);
    expect(r.rating).not.toBe('strong');
  });
});

describe('runtime-security', () => {
  it('flags dangerous code via heuristics', () => {
    const v = scoreCode('eval(new Function("return process.env"))');
    expect(v.level).toBe('dangerous');
    expect(v.allowed).toBe(false);
  });

  it('treats safe code as safe', () => {
    const v = scoreCode('const x = 1 + 1; return x;');
    expect(v.level).toBe('safe');
    expect(v.allowed).toBe(true);
  });

  it('guard enforces module allow/block lists', () => {
    const g = new RuntimeSecurityGuard();
    expect(g.checkModule('child_process').allowed).toBe(false);
    expect(g.checkModule('node:fs').allowed).toBe(true);
  });
});

describe('ransomware-detector', () => {
  it('flags mass high-entropy writes as critical', () => {
    const now = Date.now();
    const events = Array.from({ length: 30 }, (_, i) => ({
      path: `/f/${i}.txt`,
      op: 'write' as const,
      entropy: 7.9,
      ts: now,
    }));
    const a = scoreEvents(events, undefined, now);
    expect(a.level).toBe('critical');
    expect(a.reasons.length).toBeGreaterThan(0);
  });

  it('flags known ransomware extensions', () => {
    const now = Date.now();
    const events = Array.from({ length: 5 }, (_, i) => ({
      path: `/f/${i}.locked`,
      op: 'rename' as const,
      ts: now,
    }));
    const a = scoreEvents(events, undefined, now);
    expect(a.level).toBe('critical');
    expect(a.reasons.some((r) => r.includes('ransom-extension'))).toBe(true);
  });

  it('returns none for light activity', () => {
    const now = Date.now();
    const a = scoreEvents([{ path: '/a.txt', op: 'write', ts: now }], undefined, now);
    expect(a.level).toBe('none');
  });

  it('detector ingests and alerts on canary tamper', () => {
    const det = new RansomwareDetector(
      {
        windowMs: 30_000,
        burstWrites: 120,
        burstRenames: 40,
        highEntropy: 7.2,
        encryptedWriteThreshold: 25,
        canaryPaths: ['/canary.txt'],
      },
      null
    );
    return det.ingest({ path: '/canary.txt', op: 'write', ts: Date.now() }).then((a) => {
      expect(a.reasons.some((r) => r.includes('canary'))).toBe(true);
    });
  });
});

describe('secrets-scanner — extended provider patterns', () => {
  it('detects GitLab runner, Pulumi, Grafana, Cloudflare, GCP SA', () => {
    expect(hasSecret('glrt-' + 'a'.repeat(24))).toBe(true);
    expect(hasSecret('pul-' + 'b'.repeat(40))).toBe(true);
    expect(hasSecret('glsa_' + 'c'.repeat(32) + '_' + 'd'.repeat(8))).toBe(true);
    expect(hasSecret('cf-api-token: ' + 'e'.repeat(40))).toBe(true);
    expect(hasSecret('"type": "service_account"')).toBe(true);
  });

  it('redacts an extended secret of each new family', () => {
    const redacted = redactSecrets('token=' + 'pul-' + 'b'.repeat(40));
    expect(redacted).not.toContain('pul-' + 'b'.repeat(40));
    expect(redacted).toContain('****');
  });
});

describe('failure-injection — gated authorize (pure)', () => {
  const harness = new FailureInjectionHarness(
    async (e) => ({ aborted: false, observedImpact: `ran ${e.fault}` }),
    {
      enabled: true,
      allowList: ['scheduler', 'recall'],
      maxDurationMs: 10_000,
    }
  );
  const base: FailureInjectionRequest = {
    target: 'scheduler',
    fault: 'latency',
    magnitude: 200,
    durationMs: 5000,
    authorizedBy: 'sentinel-operator',
  };

  it('allows an authorized, allow-listed, within-cap request', () => {
    expect(harness.authorize(base).ok).toBe(true);
  });
  it('denies when harness disabled', () => {
    const h = new FailureInjectionHarness(async () => ({ aborted: false, observedImpact: '' }), {
      enabled: false,
      allowList: ['scheduler'],
    });
    expect(h.authorize(base).ok).toBe(false);
    expect(h.authorize(base).reason).toBe('harness-disabled');
  });
  it('denies non-allowlisted target', () => {
    expect(harness.authorize({ ...base, target: 'unknown' }).ok).toBe(false);
    expect(harness.authorize({ ...base, target: 'unknown' }).reason).toBe('target-not-allowlisted');
  });
  it('denies over duration cap', () => {
    expect(harness.authorize({ ...base, durationMs: 60_000 }).ok).toBe(false);
    expect(harness.authorize({ ...base, durationMs: 60_000 }).reason).toBe('duration-exceeds-cap');
  });
  it('denies missing authorizer', () => {
    expect(harness.authorize({ ...base, authorizedBy: '' }).ok).toBe(false);
    expect(harness.authorize({ ...base, authorizedBy: '' }).reason).toBe('unauthorized');
  });
});

describe('audit-drift — evaluateDrift (pure)', () => {
  const cfg: AuditDriftConfig = { intervalMs: 60_000, reanchorOnBreak: true, knownBreakSeq: null };
  const healthy = {
    lastCheckedAt: '',
    lastHealthy: true,
    lastVerified: 10,
    lastTotal: 10,
    consecutiveFailures: 0,
    lastBreakAt: null,
  };

  it('reports no new break when chain valid', () => {
    expect(
      evaluateDrift(
        { valid: true, verifiedEntries: 10, brokenAt: null, total: 10 } as any,
        cfg,
        healthy
      ).isNewBreak
    ).toBe(false);
  });
  it('flags a new break and triggers reanchor', () => {
    const r = evaluateDrift(
      { valid: false, verifiedEntries: 7, brokenAt: 8, total: 10 } as any,
      cfg,
      healthy
    );
    expect(r.isNewBreak).toBe(true);
    expect(r.shouldReanchor).toBe(true);
  });
  it('does not reanchor for an already-known break', () => {
    const known: AuditDriftConfig = { intervalMs: 60_000, reanchorOnBreak: true, knownBreakSeq: 8 };
    const r = evaluateDrift(
      { valid: false, verifiedEntries: 7, brokenAt: 8, total: 10 } as any,
      known,
      healthy
    );
    expect(r.isNewBreak).toBe(false);
    expect(r.shouldReanchor).toBe(false);
  });
});
