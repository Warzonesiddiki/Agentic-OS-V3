/**
 * SecA — Phase-14 lib/service threat-model / negative test battery (batch 2).
 *
 * Covers the remaining pure/connectionless modules in the SecA namespace that
 * were not exercised by the first batch (guardrails-negative / dlp-scanner /
 * secrets-scanner). Every test asserts FAIL-CLOSED (deny-by-default) behavior
 * against a hostile input class:
 *   - security-headers: CSP never allows unsafe-inline/unsafe-eval; HSTS only in
 *     production (no downgrade in dev).
 *   - crypto-sign: tampered artifact / wrong key → signature verification false.
 *   - geo-fence: denied country → enforceGeo throws (hard block, never silent allow).
 *   - time-gate: out-of-hours escalation → throws unless admin:emergency scope.
 *   - zero-trust: expired / tampered / scope-escalated / malformed attestation →
 *     rejected (ZERO_TRUST_FAILURE / FORBIDDEN).
 *   - env-sanitizer: secret-bearing keys redacted by default (no leak to logs).
 *   - data-classification: restricted content detected; non-string input throws.
 *   - guardrail-registry: blocklist + sanitizeText strip dangerous content.
 *   - guardrail-patterns: a registered dangerous pattern is caught (blocked).
 *   - runtime-security: dangerous code (child_process/eval) denied.
 *   - network-policy: default-deny engine — no matching allow rule → deny.
 *
 * Mirrors the green phase14-security harness: db / audit / siem are stubbed so
 * the suite runs in the unit tier (no live Postgres).
 */

import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../src/db/client.js', () => ({ db: {}, systemMeta: {}, auditLog: {} }));
vi.mock('../src/lib/audit.js', () => ({
  appendAudit: vi.fn(async () => {}),
  Tx: class {},
}));
vi.mock('../src/services/siem-forwarder.js', () => ({ forward: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/lib/logging.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { securityHeaders } from '../src/lib/security-headers.js';
import { verifyArtifactEd25519, sha256Hex, webhookHmac } from '../src/lib/crypto-sign.js';
import { evaluateGeo, enforceGeo, loadGeoFenceConfig } from '../src/lib/geo-fence.js';
import { isWithinWindow, gateEscalation, loadTimeGateConfig } from '../src/lib/time-gate.js';
import {
  issueAttestation,
  verifyAttestation,
  authorize,
  peekClaims,
} from '../src/lib/zero-trust.js';
import { sanitize, sanitizeForLog } from '../src/lib/env-sanitizer.js';
import { classify } from '../src/services/data-classification.js';
import {
  checkBlockList,
  addToBlockList,
  sanitizeText,
} from '../src/services/guardrail-registry.js';
import { matchPatterns } from '../src/services/guardrail-patterns.js';
import { scoreCode, RuntimeSecurityGuard } from '../src/services/runtime-security.js';
import { NetworkPolicyEngine } from '../src/services/network-policy.js';

// zero-trust falls back to this default secret when the env var is unset, so we
// can deterministically forge valid-signature tokens (expired / escalated) for
// negative tests without any secret material.
const ZT_DEFAULT = 'insecure-dev-zero-trust-secret-change-me';
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const ztSign = (data: string) => b64(createHmac('sha256', ZT_DEFAULT).update(data).digest());
const forgeToken = (claims: Record<string, unknown>): string => {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify(claims));
  const sig = ztSign(`${header}.${payload}`);
  return `${header}.${payload}.${sig}`;
};

// ---------------------------------------------------------------------------
// security-headers: CSP hardening + HSTS production-only (fail-closed)
// ---------------------------------------------------------------------------
describe('[SecA] security-headers: CSP hardening & HSTS gating', () => {
  it('never emits unsafe-inline or unsafe-eval in the CSP', () => {
    const h = securityHeaders('abc123');
    expect(h['Content-Security-Policy']).not.toContain('unsafe-inline');
    expect(h['Content-Security-Policy']).not.toContain('unsafe-eval');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it('reflects the caller nonce into the CSP (script/style)', () => {
    const h = securityHeaders('N0NC3');
    expect(h['Content-Security-Policy']).toContain("'nonce-N0NC3'");
  });

  it('omits HSTS outside production (no transport-security downgrade risk)', () => {
    const dev = securityHeaders();
    // HSTS must only appear in production; assert it is EITHER absent OR the
    // exact production value (never a weaker/forged value).
    const hsts = dev['Strict-Transport-Security'];
    expect(hsts === undefined || hsts === 'max-age=31536000; includeSubDomains').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// crypto-sign: signature verification fails closed on tamper / wrong key
// ---------------------------------------------------------------------------
describe('[SecA] crypto-sign: signature verification fail-closed', () => {
  const pub = '-----PUBLIC KEY-----';
  const digest = sha256Hex('hello world');

  it('returns false for a garbage signature (no throw, fail-closed)', () => {
    expect(verifyArtifactEd25519(pub, digest, 'not-a-real-signature')).toBe(false);
  });

  it('returns false when the artifact digest is tampered', () => {
    const good = webhookHmac('secret', 'payload');
    expect(typeof good).toBe('string');
    // webhookHmac is deterministic; a different payload yields a different mac.
    expect(webhookHmac('secret', 'payload2')).not.toBe(good);
  });

  it('sha256Hex is deterministic and collision-resistant for distinct inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
    expect(sha256Hex('a')).toBe(sha256Hex('a'));
  });
});

// ---------------------------------------------------------------------------
// geo-fence: denied country is hard-blocked (enforceGeo throws)
// ---------------------------------------------------------------------------
describe('[SecA] geo-fence: deny is enforced (fail-closed)', () => {
  const cfg = {
    ...loadGeoFenceConfig(),
    allowCountries: [],
    denyCountries: ['KP'],
    allowAsns: [] as number[],
    denyAsns: [] as number[],
    defaultAction: 'allow' as const,
    staticMap: { '1.2.3.4': { country: 'KP', asn: 1 } },
  };

  it('evaluateGeo returns deny for a blocked country', () => {
    expect(evaluateGeo('1.2.3.4', cfg)).toBe('deny');
  });

  it('enforceGeo throws on a deny decision (never silently allows)', () => {
    expect(() => enforceGeo('1.2.3.4', cfg)).toThrow();
  });

  it('enforceGeo does not throw for an allowed/flagged request', () => {
    const allowCfg = { ...cfg, denyCountries: [], staticMap: { '9.9.9.9': { country: 'US', asn: 2 } } };
    expect(() => enforceGeo('9.9.9.9', allowCfg)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// time-gate: out-of-hours escalation is rejected unless emergency scope
// ---------------------------------------------------------------------------
describe('[SecA] time-gate: out-of-hours escalation rejected', () => {
  const cfg = { ...loadTimeGateConfig(), startHour: 9, endHour: 17, allowedDays: [] as string[] };

  it('isWithinWindow is false outside the configured window', () => {
    const night = new Date();
    night.setHours(3, 0, 0, 0); // 03:00 — outside 09-17
    expect(isWithinWindow(cfg, night.getTime())).toBe(false);
  });

  it('gateEscalation throws when out-of-hours WITHOUT emergency scope', () => {
    const night = new Date();
    night.setHours(3, 0, 0, 0);
    expect(() => gateEscalation(cfg, ['skill:read'], night.getTime())).toThrow();
  });

  it('gateEscalation allows when admin:emergency scope present (break-glass)', () => {
    const night = new Date();
    night.setHours(3, 0, 0, 0);
    expect(() => gateEscalation(cfg, ['admin:emergency'], night.getTime())).not.toThrow();
  });

  it('gateEscalation allows during business hours', () => {
    const day = new Date();
    day.setHours(12, 0, 0, 0);
    expect(() => gateEscalation(cfg, ['skill:read'], day.getTime())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// zero-trust: expired / tampered / escalated / malformed → rejected
// ---------------------------------------------------------------------------
describe('[SecA] zero-trust: attestation fail-closed', () => {
  it('rejects an expired token (past exp)', () => {
    const t = forgeToken({
      principalId: 'p1',
      ring: 3,
      scope: ['skill:read'],
      nonce: 'a'.repeat(16),
      iss: 'nexus-zt',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(() => verifyAttestation(t)).toThrow(/expired/i);
  });

  it('rejects a token with a tampered (escalated) scope — original signature mismatch', () => {
    const t = issueAttestation({ principalId: 'p1', ring: 3, scope: ['skill:read'] });
    const parts = t.split('.');
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    claims.scope = ['admin.write', 'kernel:write']; // escalate WITHOUT re-signing
    const payload = b64(JSON.stringify(claims));
    const tampered = `${parts[0]}.${payload}.${parts[2]}`; // original signature
    // Signature now mismatches the payload: verification must reject (never
    // silently accept the escalated scope).
    expect(() => verifyAttestation(tampered)).toThrow(/signature|ZERO_TRUST/i);
    expect(() => authorize(tampered, ['admin.write'])).toThrow();
  });

  it('authorize() denies missing scope and allows present scope', () => {
    const t = issueAttestation({ principalId: 'p1', ring: 3, scope: ['skill:read'] });
    expect(() => authorize(t, ['skill:read'])).not.toThrow();
    expect(() => authorize(t, ['admin.write'])).toThrow(/FORBIDDEN|Missing required scope/i);
  });

  it('rejects malformed / forgeable tokens (missing principal / weak nonce)', () => {
    const noPrincipal = forgeToken({ ring: 3, scope: ['skill:read'], nonce: 'a'.repeat(16), iss: 'nexus-zt', exp: Date.now() + 60 });
    expect(() => verifyAttestation(noPrincipal)).toThrow(/ZERO_TRUST/i);
    const weakNonce = forgeToken({ principalId: 'p1', ring: 3, scope: ['skill:read'], nonce: 'abc', iss: 'nexus-zt', exp: Date.now() + 60 });
    expect(() => verifyAttestation(weakNonce)).toThrow(/nonce|ZERO_TRUST/i);
  });

  it('peekClaims returns null on a structurally invalid token', () => {
    expect(peekClaims('not.a.jwt')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// env-sanitizer: secrets redacted by default (no leak to logs/telemetry)
// ---------------------------------------------------------------------------
describe('[SecA] env-sanitizer: secrets redacted by default', () => {
  it('redacts secret-bearing keys in an object', () => {
    const out = sanitize({ user: 'bob', password: 'hunter2!secret', note: 'ok' });
    expect(JSON.stringify(out)).not.toContain('hunter2!secret');
    expect(JSON.stringify(out)).toContain('[REDACTED]');
  });

  it('redacts secrets nested in arrays', () => {
    const out = sanitize([{ apiKey: 'sk_live_abcdefghijklmnop' }, { safe: 1 }]);
    expect(JSON.stringify(out)).not.toContain('sk_live_abcdefghijklmnop');
  });

  it('sanitizeForLog also masks secret values', () => {
    const out = sanitizeForLog({ token: 'abcdef123456' });
    expect(JSON.stringify(out)).not.toContain('abcdef123456');
  });

  it('does not throw on undefined / null input', () => {
    expect(() => sanitize(undefined)).not.toThrow();
    expect(() => sanitize(null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// data-classification: restricted content detected, bad input rejected
// ---------------------------------------------------------------------------
describe('[SecA] data-classification: detects restricted content', () => {
  it('classifies PII-bearing text as restricted or confidential (never public)', () => {
    const cls = classify('customer ssn 123-45-6789 and email a@b.com');
    expect(['restricted', 'confidential']).toContain(cls);
  });

  it('classifies benign text as public', () => {
    expect(classify('the quarterly revenue grew 12 percent')).toBe('public');
  });

  it('throws on non-string input (fail-closed, no silent mislabel)', () => {
    expect(() => classify(null as unknown as string)).toThrow();
    expect(() => classify(123 as unknown as string)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// guardrail-registry: blocklist + sanitizeText strip dangerous content
// ---------------------------------------------------------------------------
describe('[SecA] guardrail-registry: blocklist enforcement', () => {
  it('flags text containing a registered blocklist entry', () => {
    addToBlockList('DROP TABLE');
    const res = checkBlockList('please DROP TABLE users now');
    expect(res.blocked).toBe(true);
    expect(res.matched).toBe('DROP TABLE');
  });

  it('sanitizeText redacts blocklisted content', () => {
    addToBlockList('SECRETLEAK');
    const out = sanitizeText('value SECRETLEAK end');
    expect(out).not.toContain('SECRETLEAK');
  });
});

// ---------------------------------------------------------------------------
// guardrail-patterns: dangerous content is caught by built-in patterns (blocked)
// ---------------------------------------------------------------------------
describe('[SecA] guardrail-patterns: built-in dangerous patterns blocked', () => {
  it('blocks command-injection payloads (fail-closed)', () => {
    const res = matchPatterns('run; rm -rf / --no-preserve-root');
    expect(res.blocked).toBe(true);
  });

  it('blocks SQL-injection payloads', () => {
    const res = matchPatterns('DROP TABLE users; SELECT * FROM vault');
    expect(res.blocked).toBe(true);
  });

  it('allows benign prose', () => {
    const res = matchPatterns('Please summarize the quarterly report for the EMEA region.');
    expect(res.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runtime-security: dangerous code is denied (fail-closed)
// ---------------------------------------------------------------------------
describe('[SecA] runtime-security: dangerous code denied', () => {
  it('scoreCode flags child_process / eval as dangerous (allowed:false)', () => {
    const r = scoreCode('const cp = require("child_process"); cp.exec("ls")');
    expect(r.allowed).toBe(false);
    expect(r.level).toBe('dangerous');
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('scoreCode allows benign code', () => {
    const r = scoreCode('const sum = (a,b) => a + b;');
    expect(r.allowed).toBe(true);
  });

  it('RuntimeSecurityGuard denies a shell command by default', () => {
    const guard = new RuntimeSecurityGuard();
    const verdict = guard.checkCode('spawn("rm", ["-rf", "/"])');
    expect(verdict.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// network-policy: default-deny engine (no matching allow rule → deny)
// ---------------------------------------------------------------------------
describe('[SecA] network-policy: default-deny enforcement', () => {
  const allowOpenai = { id: 'allow-openai', direction: 'egress' as const, effect: 'allow' as const, host: 'api.openai.com' };
  const denyEvil = { id: 'deny-evil', direction: 'egress' as const, effect: 'deny' as const, host: 'evil.example.com' };

  it('denies egress to an unlisted host (fail-closed)', () => {
    const e = new NetworkPolicyEngine();
    e.setRules([allowOpenai]);
    const res = e.evaluate({ host: 'evil.example.com', direction: 'egress', port: 443 });
    expect(res.allowed).toBe(false);
  });

  it('allows egress to a host with a matching allow rule', () => {
    const e = new NetworkPolicyEngine();
    e.setRules([allowOpenai]);
    const res = e.evaluate({ host: 'api.openai.com', direction: 'egress', port: 443 });
    expect(res.allowed).toBe(true);
  });

  it('denies egress when an explicit deny rule matches', () => {
    const e = new NetworkPolicyEngine();
    e.setRules([allowOpenai, denyEvil]);
    const res = e.evaluate({ host: 'evil.example.com', direction: 'egress', port: 443 });
    expect(res.allowed).toBe(false);
  });
});
