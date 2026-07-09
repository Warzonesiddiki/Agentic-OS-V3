import type {
  ApiMemory,
  ApiSkill,
  ApiProject,
  ApiNote,
  ApiRecallResult,
  ApiAuditEntry,
  ApiHealth,
  Pipeline,
  PipelineInput,
  ApiEnvelope,
  ListResponse,
} from './api-types';
import type {
  Org,
  Workspace,
  User,
  ApiKey,
  UsageSummary,
  AuditEvent,
  SsoConfig,
  BillingMeter,
  RbacRole,
  SiemSink,
  TenantRetention,
} from './enterprise-types';

let baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
let apiKey = '';

export function configureClient(url: string, key: string): void {
  baseUrl = url;
  apiKey = key;
}

export function getBaseUrl(): string {
  return baseUrl;
}

export function getApiKey(): string {
  return apiKey;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  if (apiKey) {
    headers.set('authorization', `Bearer ${apiKey}`);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  const env: ApiEnvelope<T> = await res.json().catch(() => ({
    ok: false,
    error: { code: 'NETWORK_ERROR', message: 'Failed to parse response' },
    traceId: '',
  }));

  if (!env.ok) {
    const errorMsg = 'error' in env ? env.error?.message : undefined;
    throw new Error(errorMsg ?? `Request failed (${res.status})`);
  }

  return env.data;
}

export const apiClient = {
  // Memories CRUD
  createMemory: (m: {
    kind: string;
    title: string;
    content: string;
    tags?: string[];
    importance?: number;
    source?: string;
  }): Promise<ApiMemory> =>
    request<ApiMemory>('/api/v1/memories', { method: 'POST', body: JSON.stringify(m) }),
  updateMemory: (id: string, patch: Record<string, unknown>): Promise<ApiMemory> =>
    request<ApiMemory>(`/api/v1/memories/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteMemory: (id: string): Promise<void> =>
    request<void>(`/api/v1/memories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listMemories: (): Promise<ListResponse<ApiMemory>> =>
    request<ListResponse<ApiMemory>>('/api/v1/memories'),

  // Skills CRUD
  createSkill: (s: {
    name: string;
    title: string;
    description: string;
    content: string;
    category?: string;
    tags?: string[];
    source?: string;
  }): Promise<ApiSkill> =>
    request<ApiSkill>('/api/v1/skills', { method: 'POST', body: JSON.stringify(s) }),
  updateSkill: (id: string, patch: Record<string, unknown>): Promise<ApiSkill> =>
    request<ApiSkill>(`/api/v1/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteSkill: (id: string): Promise<void> =>
    request<void>(`/api/v1/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listSkills: (): Promise<ListResponse<ApiSkill>> =>
    request<ListResponse<ApiSkill>>('/api/v1/skills'),
  recordOutcome: (id: string, outcome: 'success' | 'failure'): Promise<ApiSkill> =>
    request<ApiSkill>(`/api/v1/skills/${encodeURIComponent(id)}/outcome`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }),

  // Projects CRUD
  listProjects: (): Promise<ListResponse<ApiProject>> =>
    request<ListResponse<ApiProject>>('/api/v1/projects'),
  transfer: (body: {
    projectName: string;
    description?: string;
    memories?: unknown[];
    skills?: unknown[];
    transcript?: string;
    files?: unknown[];
  }): Promise<{ success: boolean }> =>
    request<{ success: boolean }>('/api/v1/projects/transfer', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Vault CRUD
  listNotes: (): Promise<ListResponse<ApiNote>> =>
    request<ListResponse<ApiNote>>('/api/v1/vault/notes'),
  syncVault: (): Promise<{ added: number; updated: number; deleted: number }> =>
    request<{ added: number; updated: number; deleted: number }>('/api/v1/vault/sync', {
      method: 'POST',
    }),
  writeBack: (id: string, path?: string): Promise<{ success: boolean; path: string }> =>
    request<{ success: boolean; path: string }>('/api/v1/vault/write-back', {
      method: 'POST',
      body: JSON.stringify({ id, path }),
    }),

  // Recall
  recall: (q: string, budget = 1500): Promise<ApiRecallResult> =>
    request<ApiRecallResult>(`/api/v1/recall?q=${encodeURIComponent(q)}&budget=${budget}`),

  // Checkpoint, capture, feedback
  checkpoint: (label: string, context: string, projectName?: string): Promise<{ id: string }> =>
    request<{ id: string }>('/api/v1/checkpoint', {
      method: 'POST',
      body: JSON.stringify({ label, context, projectName }),
    }),
  capture: (transcript: string, projectName?: string): Promise<{ id: string }> =>
    request<{ id: string }>('/api/v1/sessions/capture', {
      method: 'POST',
      body: JSON.stringify({ transcript, projectName }),
    }),
  feedback: (
    query: string,
    itemId: string,
    itemType: string,
    helpful: boolean
  ): Promise<{ success: boolean }> =>
    request<{ success: boolean }>('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({ query, itemId, itemType, helpful }),
    }),

  // Safety
  killSwitch: (enabled: boolean, reason?: string): Promise<{ status: string }> =>
    request<{ status: string }>('/api/v1/safety/kill-switch', {
      method: 'POST',
      body: JSON.stringify({ enabled, reason }),
    }),
  heartbeat: (): Promise<ApiHealth> =>
    request<ApiHealth>('/api/v1/safety/heartbeat', { method: 'POST' }),

  // Brain
  exportBrain: (): Promise<unknown> => request<unknown>('/api/v1/brain/export'),
  importBrain: (data: unknown): Promise<{ success: boolean }> =>
    request<{ success: boolean }>('/api/v1/brain/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  compressBrain: (): Promise<{ before: number; after: number }> =>
    request<{ before: number; after: number }>('/api/v1/brain/compress', { method: 'POST' }),
  rebuildEmbeddings: (): Promise<{ count: number }> =>
    request<{ count: number }>('/api/v1/brain/embeddings/rebuild', { method: 'POST' }),
  verifyAudit: (): Promise<{ ok: boolean; message?: string }> =>
    request<{ ok: boolean; message?: string }>('/api/v1/audit'),
  listAuditLogs: (): Promise<ApiAuditEntry[]> => request<ApiAuditEntry[]>('/api/v1/audit/logs'),
  listLedger: (): Promise<unknown[]> => request<unknown[]>('/api/v1/ledger'),

  // Pipelines
  listPipelines: (): Promise<string[]> => request<string[]>('/api/v1/pipelines'),
  getPipeline: (name: string): Promise<Pipeline> =>
    request<Pipeline>(`/api/v1/pipelines/${encodeURIComponent(name)}`),
  createPipeline: (data: PipelineInput): Promise<Pipeline> =>
    request<Pipeline>('/api/v1/pipelines', { method: 'POST', body: JSON.stringify(data) }),

  // ───────────────────────────────────────────────────────────────
  // PHASE 17 — Enterprise Features (OIDC/SAML, RBAC, multi-tenant, billing, audit, SIEM)
  // Every call hits the real Hono backend. No localStorage demo fallback.
  // ───────────────────────────────────────────────────────────────

  // Multi-tenant org / workspace hierarchy
  listOrgs: (): Promise<Org[]> => request<Org[]>('/api/v1/enterprise/orgs'),
  getOrg: (orgId: string): Promise<Org> =>
    request<Org>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}`),
  createOrg: (body: { name: string; slug: string; parentId?: string | null }): Promise<Org> =>
    request<Org>('/api/v1/enterprise/orgs', { method: 'POST', body: JSON.stringify(body) }),
  listWorkspaces: (orgId: string): Promise<Workspace[]> =>
    request<Workspace[]>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/workspaces`),
  createWorkspace: (
    orgId: string,
    body: { name: string; region?: string; dataResidency?: string }
  ): Promise<Workspace> =>
    request<Workspace>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/workspaces`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // User CRUD
  listUsers: (orgId: string): Promise<User[]> =>
    request<User[]>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/users`),
  createUser: (
    orgId: string,
    body: { email: string; name: string; roles: string[] }
  ): Promise<User> =>
    request<User>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/users`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateUser: (orgId: string, userId: string, patch: Partial<User>): Promise<User> =>
    request<User>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
  deleteUser: (orgId: string, userId: string): Promise<void> =>
    request<void>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    ),

  // API key management + rate-limit tiers
  listApiKeys: (orgId: string): Promise<ApiKey[]> =>
    request<ApiKey[]>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/keys`),
  createApiKey: (
    orgId: string,
    body: { label: string; tier: ApiKey['tier']; scopes: string[]; expiresAt?: string | null }
  ): Promise<ApiKey & { secret: string }> =>
    request<ApiKey & { secret: string }>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/keys`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  revokeApiKey: (orgId: string, keyId: string): Promise<void> =>
    request<void>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/keys/${encodeURIComponent(keyId)}`,
      { method: 'DELETE' }
    ),

  // RBAC engine + custom roles
  listRoles: (orgId: string): Promise<RbacRole[]> =>
    request<RbacRole[]>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/roles`),
  createRole: (orgId: string, body: { name: string; permissions: string[] }): Promise<RbacRole> =>
    request<RbacRole>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/roles`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assignRole: (orgId: string, userId: string, roleId: string): Promise<void> =>
    request<void>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/users/${encodeURIComponent(userId)}/roles`,
      { method: 'POST', body: JSON.stringify({ roleId }) }
    ),

  // Billing metering + tiers + seats + budget alerts
  getBilling: (orgId: string): Promise<BillingMeter> =>
    request<BillingMeter>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/billing`),
  getUsage: (orgId: string, window = '30d'): Promise<UsageSummary> =>
    request<UsageSummary>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/usage?window=${encodeURIComponent(window)}`
    ),
  setBudgetAlert: (orgId: string, pct: number): Promise<void> =>
    request<void>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/billing/budget-alert`, {
      method: 'POST',
      body: JSON.stringify({ pct }),
    }),

  // Audit trail viewer (filters + export) — data shape per Sentinel's audit/SIEM contract
  listAudit: (
    orgId: string,
    query?: {
      actor?: string;
      action?: string;
      outcome?: string;
      from?: string;
      to?: string;
      limit?: number;
    }
  ): Promise<AuditEvent[]> => {
    const qs = new URLSearchParams();
    if (query) {
      if (query.actor) qs.set('actor', query.actor);
      if (query.action) qs.set('action', query.action);
      if (query.outcome) qs.set('outcome', query.outcome);
      if (query.from) qs.set('from', query.from);
      if (query.to) qs.set('to', query.to);
      if (query.limit) qs.set('limit', String(query.limit));
    }
    const q = qs.toString();
    return request<AuditEvent[]>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/audit${q ? `?${q}` : ''}`
    );
  },
  exportAudit: (orgId: string, format: 'csv' | 'json' | 'pdf'): Promise<Blob> => {
    // Streamed download — bypasses JSON envelope.
    return fetch(
      `${baseUrl}/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/audit/export?format=${format}`,
      {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      }
    ).then((r) => r.blob());
  },
  scheduledAuditExport: (
    orgId: string,
    body: { cron: string; format: 'csv' | 'json' | 'pdf'; sinkId: string }
  ): Promise<{ id: string }> =>
    request<{ id: string }>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/audit/scheduled-export`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  // SSO / OIDC / SAML + JIT + IdP-initiated
  getSso: (orgId: string, provider: 'oidc' | 'saml'): Promise<SsoConfig> =>
    request<SsoConfig>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/sso/${provider}`),
  upsertSso: (
    orgId: string,
    provider: 'oidc' | 'saml',
    body: Partial<SsoConfig>
  ): Promise<SsoConfig> =>
    request<SsoConfig>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/sso/${provider}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  startSsoLogin: (provider: 'oidc' | 'saml', orgId: string): Promise<{ redirectUrl: string }> =>
    request<{ redirectUrl: string }>(`/api/v1/auth/sso/${provider}/start`, {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    }),

  // SCIM provisioning
  scimSync: (
    orgId: string,
    body: { endpoint: string; token: string }
  ): Promise<{ synced: number }> =>
    request<{ synced: number }>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/scim/sync`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // SIEM streaming sinks
  listSiemSinks: (orgId: string): Promise<SiemSink[]> =>
    request<SiemSink[]>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/siem`),
  createSiemSink: (orgId: string, body: Omit<SiemSink, 'id' | 'orgId'>): Promise<SiemSink> =>
    request<SiemSink>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/siem`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Retention engine, PITR, CMK, data residency, backup
  getTenantConfig: (orgId: string): Promise<TenantRetention> =>
    request<TenantRetention>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/tenant-config`),
  updateTenantConfig: (orgId: string, patch: Partial<TenantRetention>): Promise<TenantRetention> =>
    request<TenantRetention>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/tenant-config`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  triggerBackup: (orgId: string): Promise<{ backupId: string; pitr: boolean }> =>
    request<{ backupId: string; pitr: boolean }>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/backup`,
      { method: 'POST' }
    ),

  // White-label theming
  getTheme: (orgId: string): Promise<{ primary: string; logoUrl: string; brandName: string }> =>
    request<{ primary: string; logoUrl: string; brandName: string }>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/theme`
    ),
  updateTheme: (
    orgId: string,
    body: { primary?: string; logoUrl?: string; brandName?: string }
  ): Promise<void> =>
    request<void>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/theme`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // Onboarding wizard completion
  completeOnboarding: (orgId: string, step: string): Promise<void> =>
    request<void>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/onboarding`, {
      method: 'POST',
      body: JSON.stringify({ step }),
    }),

  // Org compliance report
  getComplianceReport: (orgId: string): Promise<Blob> =>
    fetch(`${baseUrl}/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/compliance/report`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    }).then((r) => r.blob()),

  // SLA monitor
  getSla: (orgId: string): Promise<{ uptimePct: number; p99Ms: number; errorRate: number }> =>
    request<{ uptimePct: number; p99Ms: number; errorRate: number }>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/sla`
    ),

  // Cross-org sharing (gap 17.22)
  shareResource: (
    orgId: string,
    body: { resource: string; resourceId: string; targetOrgId: string; role: string }
  ): Promise<void> =>
    request<void>(`/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/share`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Invoicing + payment methods (gap 17.25/17.26)
  listInvoices: (
    orgId: string
  ): Promise<{ id: string; period: string; amountUsd: number; status: string; pdfUrl: string }[]> =>
    request<{ id: string; period: string; amountUsd: number; status: string; pdfUrl: string }[]>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/invoices`
    ),
  listPaymentMethods: (orgId: string): Promise<{ id: string; brand: string; last4: string }[]> =>
    request<{ id: string; brand: string; last4: string }[]>(
      `/api/v1/enterprise/orgs/${encodeURIComponent(orgId)}/payment-methods`
    ),
};
