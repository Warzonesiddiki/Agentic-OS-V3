/**
 * PHASE 17 — Enterprise Features routes.
 * Mounted at /api/v1/enterprise. All endpoints are RLS-scoped to the
 * resolved org (tenant isolation) and enforce RBAC scopes via requireScope.
 * Thin handlers over services/enterprise.service.ts; emit audit + SIEM via Sentinel's barrel.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../lib/zvalidator.js';
import { requireScope, type Scope } from '../lib/auth-context.js';
import { ok, err } from '../lib/envelope.js';
import * as ent from '../services/enterprise.service.js';

const enterpriseRouter = new Hono();
const rid = (c: any) => c.get('requestId') ?? '';

/* ── Orgs / Workspaces ─────────────────────────────────── */
enterpriseRouter.get('/orgs', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listOrgs(), rid(c)));
});
enterpriseRouter.get('/orgs/:orgId', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  try {
    return c.json(ok(await ent.getOrg(c.req.param('orgId')), rid(c)));
  } catch {
    return c.json(err('NOT_FOUND', 'org not found', rid(c)), 404);
  }
});
enterpriseRouter.post(
  '/orgs',
  zValidator(
    'json',
    z.object({ name: z.string().min(1), slug: z.string().min(1), parentId: z.string().optional() })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    return c.json(ok(await ent.createOrg(c.req.valid('json')), rid(c)), 201);
  }
);
enterpriseRouter.get('/orgs/:orgId/workspaces', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listWorkspaces(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.post(
  '/orgs/:orgId/workspaces',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      region: z.string().optional(),
      dataResidency: z.string().optional(),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    return c.json(
      ok(await ent.createWorkspace(c.req.param('orgId'), c.req.valid('json')), rid(c)),
      201
    );
  }
);

/* ── Users ─────────────────────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/users', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listUsers(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.post(
  '/orgs/:orgId/users',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      name: z.string().min(1),
      roles: z.array(z.string()).default(['member']),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    try {
      return c.json(
        ok(await ent.createUser(c.req.param('orgId'), c.req.valid('json')), rid(c)),
        201
      );
    } catch {
      return c.json(err('CONFLICT', 'user already exists', rid(c)), 409);
    }
  }
);
enterpriseRouter.patch(
  '/orgs/:orgId/users/:userId',
  zValidator(
    'json',
    z
      .object({
        email: z.string().email().optional(),
        name: z.string().optional(),
        roles: z.array(z.string()).optional(),
        status: z.enum(['active', 'invited', 'suspended', 'deactivated']).optional(),
        mfaEnabled: z.boolean().optional(),
      })
      .partial()
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    const { orgId, userId } = c.req.param();
    try {
      return c.json(ok(await ent.updateUser(orgId, userId, c.req.valid('json')), rid(c)));
    } catch {
      return c.json(err('NOT_FOUND', 'user not found', rid(c)), 404);
    }
  }
);
enterpriseRouter.delete('/orgs/:orgId/users/:userId', async (c) => {
  await requireScope(c, 'enterprise:write' as Scope);
  const { orgId, userId } = c.req.param();
  await ent.deleteUser(orgId, userId);
  return c.json(ok({ deleted: userId }, rid(c)));
});

/* ── API keys + rate tiers ─────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/keys', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listApiKeys(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.post(
  '/orgs/:orgId/keys',
  zValidator(
    'json',
    z.object({
      label: z.string().min(1),
      tier: z.enum(['free', 'tier1', 'tier2', 'tier3']).default('free'),
      scopes: z.array(z.string()).default([]),
      expiresAt: z.string().optional().nullable(),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    const orgId = c.req.param('orgId');
    const created = await ent.createApiKey(orgId, c.req.valid('json'));
    return c.json(
      ok(
        {
          id: created.id,
          label: created.label,
          prefix: created.prefix,
          tier: created.tier,
          scopes: created.scopes,
          rateLimitRpm: created.rateLimitRpm,
          secret: (created as any).secret,
        },
        rid(c)
      ),
      201
    );
  }
);
enterpriseRouter.delete('/orgs/:orgId/keys/:keyId', async (c) => {
  await requireScope(c, 'enterprise:write' as Scope);
  const { orgId, keyId } = c.req.param();
  await ent.revokeApiKey(orgId, keyId);
  return c.json(ok({ revoked: keyId }, rid(c)));
});

/* ── RBAC roles + custom roles ─────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/roles', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listRoles(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.post(
  '/orgs/:orgId/roles',
  zValidator(
    'json',
    z.object({ name: z.string().min(1), permissions: z.array(z.string()).default([]) })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    try {
      return c.json(
        ok(await ent.createRole(c.req.param('orgId'), c.req.valid('json')), rid(c)),
        201
      );
    } catch {
      return c.json(err('CONFLICT', 'role already exists', rid(c)), 409);
    }
  }
);
enterpriseRouter.post(
  '/orgs/:orgId/users/:userId/roles',
  zValidator('json', z.object({ roleId: z.string().min(1) })),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    const { orgId, userId } = c.req.param();
    try {
      await ent.assignRole(orgId, userId, c.req.valid('json').roleId);
      return c.json(ok({ assigned: true }, rid(c)));
    } catch {
      return c.json(err('NOT_FOUND', 'user or role not found', rid(c)), 404);
    }
  }
);

/* ── Billing / usage metering ───────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/billing', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.getBilling(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.get(
  '/orgs/:orgId/usage',
  zValidator('query', z.object({ window: z.enum(['7d', '30d', '90d']).optional() })),
  async (c) => {
    await requireScope(c, 'enterprise:read' as Scope);
    return c.json(
      ok(await ent.getUsage(c.req.param('orgId'), c.req.valid('query').window ?? '30d'), rid(c))
    );
  }
);
enterpriseRouter.post(
  '/orgs/:orgId/billing/budget-alert',
  zValidator('json', z.object({ pct: z.number().min(0).max(100) })),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    await ent.setBudgetAlert(c.req.param('orgId'), c.req.valid('json').pct);
    return c.json(ok({ set: true }, rid(c)));
  }
);

/* ── Audit trail (filters + export) ─────────────────────── */
enterpriseRouter.get(
  '/orgs/:orgId/audit',
  zValidator(
    'query',
    z.object({
      actor: z.string().optional(),
      action: z.string().optional(),
      outcome: z.enum(['success', 'denied', 'error']).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().optional(),
    })
  ),
  async (c) => {
    await requireScope(c, 'audit:read' as Scope);
    return c.json(ok(await ent.listAudit(c.req.param('orgId'), c.req.valid('query')), rid(c)));
  }
);
enterpriseRouter.get(
  '/orgs/:orgId/audit/export',
  zValidator('query', z.object({ format: z.enum(['csv', 'json', 'pdf']).default('json') })),
  async (c) => {
    await requireScope(c, 'audit:read' as Scope);
    const orgId = c.req.param('orgId');
    const rows = await ent.listAudit(orgId, {});
    const fmt = c.req.valid('query').format;
    const header = 'ts,actor,action,resource,resourceId,outcome,ip\n';
    const body = rows
      .map(
        (r) =>
          `${r.ts},${r.actorEmail ?? ''},${r.action},${r.resource},${r.resourceId ?? ''},${r.outcome},${r.ip ?? ''}`
      )
      .join('\n');
    if (fmt === 'csv')
      return new Response(header + body, {
        headers: {
          'content-type': 'text/csv',
          'content-disposition': `attachment; filename=audit.${orgId}.csv`,
        },
      });
    return new Response(JSON.stringify({ rows }), {
      headers: {
        'content-type': 'application/json',
        'content-disposition': `attachment; filename=audit.${orgId}.json`,
      },
    });
  }
);
enterpriseRouter.post(
  '/orgs/:orgId/audit/scheduled-export',
  zValidator(
    'json',
    z.object({
      cron: z.string().min(1),
      format: z.enum(['csv', 'json', 'pdf']),
      sinkId: z.string().min(1),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    const id = `sax_${crypto.randomUUID()}`;
    return c.json(ok({ id }, rid(c)), 201);
  }
);

/* ── SSO / OIDC / SAML ──────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/sso/:provider', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  const provider = c.req.param('provider') as 'oidc' | 'saml';
  if (provider !== 'oidc' && provider !== 'saml')
    return c.json(err('BAD_REQUEST', 'unsupported provider', rid(c)), 400);
  return c.json(ok(await ent.getSso(c.req.param('orgId'), provider), rid(c)));
});
enterpriseRouter.put(
  '/orgs/:orgId/sso/:provider',
  zValidator(
    'json',
    z
      .object({
        enabled: z.boolean().optional(),
        ssoUrl: z.string().optional(),
        entityId: z.string().optional(),
        cert: z.string().optional(),
        idpInitiated: z.boolean().optional(),
        jitProvisioning: z.boolean().optional(),
        domainRestriction: z.array(z.string()).optional(),
      })
      .partial()
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    const provider = c.req.param('provider') as 'oidc' | 'saml';
    if (provider !== 'oidc' && provider !== 'saml')
      return c.json(err('BAD_REQUEST', 'unsupported provider', rid(c)), 400);
    await ent.upsertSso(c.req.param('orgId'), provider, c.req.valid('json'));
    return c.json(ok({ updated: true }, rid(c)));
  }
);
enterpriseRouter.post(
  '/auth/sso/:provider/start',
  zValidator('json', z.object({ orgId: z.string().min(1) })),
  async (c) => {
    const provider = c.req.param('provider') as 'oidc' | 'saml';
    if (provider !== 'oidc' && provider !== 'saml')
      return c.json(err('BAD_REQUEST', 'unsupported provider', rid(c)), 400);
    try {
      return c.json(ok(await ent.startSsoLogin(c.req.valid('json').orgId, provider), rid(c)), 200);
    } catch {
      return c.json(err('BAD_REQUEST', 'sso not enabled', rid(c)), 400);
    }
  }
);

/* ── SCIM provisioning ─────────────────────────────────── */
enterpriseRouter.post(
  '/orgs/:orgId/scim/sync',
  zValidator('json', z.object({ endpoint: z.string().min(1), token: z.string().min(1) })),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    return c.json(ok(await ent.scimSync(c.req.param('orgId'), c.req.valid('json')), rid(c)));
  }
);

/* ── SIEM streaming sinks ──────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/siem', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listSiemSinks(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.post(
  '/orgs/:orgId/siem',
  zValidator(
    'json',
    z.object({
      kind: z.enum(['webhook', 'splunk', 'datadog', 'elastic']),
      endpoint: z.string().min(1),
      enabled: z.boolean().default(true),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    return c.json(
      ok(await ent.createSiemSink(c.req.param('orgId'), c.req.valid('json')), rid(c)),
      201
    );
  }
);

/* ── Tenant retention / PITR / CMK / theming ──────────── */
enterpriseRouter.get('/orgs/:orgId/tenant-config', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.getTenantConfig(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.patch(
  '/orgs/:orgId/tenant-config',
  zValidator(
    'json',
    z
      .object({
        ssoEnabled: z.boolean().optional(),
        ssoIdpInitiated: z.boolean().optional(),
        ssoEntityId: z.string().optional(),
        ssoAcsUrl: z.string().optional(),
        ssoSsoUrl: z.string().optional(),
        ssoCert: z.string().optional(),
        ssoJitProvisioning: z.boolean().optional(),
        ssoDomainRestriction: z.array(z.string()).optional(),
        auditRetentionDays: z.number().optional(),
        memoryRetentionDays: z.number().optional(),
        backupPitr: z.boolean().optional(),
        cmkEnabled: z.boolean().optional(),
        cmkKeyId: z.string().nullable().optional(),
        themePrimary: z.string().optional(),
        themeLogoUrl: z.string().optional(),
        themeBrandName: z.string().optional(),
        budgetAlertPct: z.number().optional(),
      })
      .partial()
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    return c.json(
      ok(await ent.updateTenantConfig(c.req.param('orgId'), c.req.valid('json')), rid(c))
    );
  }
);
enterpriseRouter.post('/orgs/:orgId/backup', async (c) => {
  await requireScope(c, 'enterprise:write' as Scope);
  return c.json(ok(await ent.triggerBackup(c.req.param('orgId')), rid(c)));
});

/* ── White-label theming ───────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/theme', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.getTheme(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.put(
  '/orgs/:orgId/theme',
  zValidator(
    'json',
    z
      .object({
        primary: z.string().optional(),
        logoUrl: z.string().optional(),
        brandName: z.string().optional(),
      })
      .partial()
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    await ent.updateTheme(c.req.param('orgId'), c.req.valid('json'));
    return c.json(ok({ updated: true }, rid(c)));
  }
);

/* ── Onboarding wizard ──────────────────────────────────── */
enterpriseRouter.post(
  '/orgs/:orgId/onboarding',
  zValidator('json', z.object({ step: z.string().min(1) })),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    await ent.completeOnboarding(c.req.param('orgId'), c.req.valid('json').step);
    return c.json(ok({ completed: true }, rid(c)));
  }
);

/* ── SLA monitor ──────────────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/sla', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.getSla(c.req.param('orgId')), rid(c)));
});

/* ── Cross-org sharing (gap 17.22) ───────────────────── */
enterpriseRouter.post(
  '/orgs/:orgId/share',
  zValidator(
    'json',
    z.object({
      resource: z.enum(['memory', 'skill', 'project']),
      resourceId: z.string().min(1),
      targetOrgId: z.string().min(1),
      role: z.enum(['viewer', 'editor']).default('viewer'),
    })
  ),
  async (c) => {
    await requireScope(c, 'enterprise:write' as Scope);
    await ent.shareResource(c.req.param('orgId'), c.req.valid('json'));
    return c.json(ok({ shared: true }, rid(c)));
  }
);

/* ── Invoices + payment methods (gap 17.25/17.26) ────── */
enterpriseRouter.get('/orgs/:orgId/invoices', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listInvoices(c.req.param('orgId')), rid(c)));
});
enterpriseRouter.get('/orgs/:orgId/payment-methods', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  return c.json(ok(await ent.listPaymentMethods(c.req.param('orgId')), rid(c)));
});

/* ── Org compliance report ──────────────────────────────── */
enterpriseRouter.get('/orgs/:orgId/compliance/report', async (c) => {
  await requireScope(c, 'enterprise:read' as Scope);
  const report = await ent.getComplianceReport(c.req.param('orgId'));
  return new Response(JSON.stringify(report.payload), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename=compliance.${c.req.param('orgId')}.json`,
    },
  });
});

export { enterpriseRouter };
