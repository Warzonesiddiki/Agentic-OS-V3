// Enterprise feature DTOs — Phase 17 (OIDC/SAML, RBAC, multi-tenant, billing, audit, SIEM).
// These mirror the server-side JSON Schema. Keep in sync with server/src/routes/enterprise.ts.

export interface Org {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  plan: 'free' | 'team' | 'business' | 'enterprise';
  seats: number;
  createdAt: string;
}

export interface Workspace {
  id: string;
  orgId: string;
  name: string;
  region: string;
  dataResidency: string;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  roles: string[];
  status: 'active' | 'invited' | 'suspended' | 'deactivated';
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  orgId: string;
  label: string;
  prefix: string;
  tier: 'free' | 'tier1' | 'tier2' | 'tier3';
  scopes: string[];
  rateLimitRpm: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface UsagePoint {
  ts: string;
  requests: number;
  tokens: number;
  costUsd: number;
}

export interface UsageSummary {
  orgId: string;
  window: string;
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Record<string, number>;
  series: UsagePoint[];
}

export interface AuditEvent {
  id: string;
  ts: string;
  actorId: string | null;
  actorEmail: string | null;
  orgId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  outcome: 'success' | 'denied' | 'error';
  ip: string | null;
  meta: Record<string, unknown>;
}

export interface SsoConfig {
  provider: 'oidc' | 'saml';
  enabled: boolean;
  idpInitiated: boolean;
  entityId: string;
  acsUrl: string;
  ssoUrl: string;
  cert: string;
  jitProvisioning: boolean;
  domainRestriction: string[];
}

export interface BillingMeter {
  orgId: string;
  plan: string;
  seatUsage: number;
  seatLimit: number;
  meterUsage: number;
  meterLimit: number;
  budgetAlertPct: number;
  currentPeriodCostUsd: number;
}

export interface RbacRole {
  id: string;
  orgId: string;
  name: string;
  isCustom: boolean;
  permissions: string[];
}

export interface SiemSink {
  id: string;
  orgId: string;
  kind: 'splunk' | 'datadog' | 'elastic' | 'webhook';
  endpoint: string;
  enabled: boolean;
}

export interface TenantRetention {
  orgId: string;
  auditDays: number;
  memoryDays: number;
  backupPitr: boolean;
  cmkEnabled: boolean;
  cmkKeyId: string | null;
}
