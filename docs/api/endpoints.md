# NEXUS 2.0 — API Endpoint Reference (OpenAPI-ish)

> Generated from `server/src/routes/*.ts`. Paths are relative to the server base (`http://localhost:9900`).
> All handlers return `c.json(ok(...))` / `c.json(err(...))` envelopes. Auth: `Authorization: Bearer <NEXUS_API_KEY>`
> (scoped API keys, 9 scopes) unless noted. This is a living index; regenerate from the route files as they change.

## Conventions
- Envelope: `{ ok: boolean, data?: T, error?: { code, message } }`.
- Pagination: `?limit=&offset=` where noted.
- Errors: `404` not found, `423` kill-switch engaged, `429` rate limited, `401` unauthorized.

---

## Memory (`routes/memory.ts`, `routes/memory-*.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/memories` | List memories (paginated, filter by projectId/tags/type). |
| POST | `/api/v1/memories` | Create a memory. |
| GET | `/api/v1/memories/:id` | Get a memory by id. |
| PUT | `/api/v1/memories/:id` | Update a memory. |
| DELETE | `/api/v1/memories/:id` | Delete a memory. |
| POST | `/api/v1/memory/search` | Lexical + semantic recall query. |
| GET | `/api/v1/memory/search/suggest` | Autocomplete / query suggestions. |
| POST | `/api/v1/memory/nl-query` | Natural-language query over memories. |
| GET | `/api/v1/memory/graph` | Graph of related memories. |
| GET | `/api/v1/memory/clusters` | List memory clusters. |
| POST | `/api/v1/memory/batch` | Bulk create/update/delete (applyBatch). |
| GET/POST/PUT/DELETE | `/api/v1/memory/tags` , `/api/v1/memory/tags/:id` | Tag taxonomy CRUD + assign. |
| GET | `/api/v1/memory/feedback` | Recall feedback stats (adaptive weights). |

## Recall (`recall.ts`, `federated-recall.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/recall` | Run the fused recall pipeline (RRF). |
| GET | `/api/v1/federated/stats` | Federated proof / privacy-budget stats. |
| POST | `/api/v1/federated/proof` | Publish a signed memory proof. |
| POST | `/api/v1/federated/verify` | Verify a memory proof signature. |

## Kernel & Scheduler (`routes/kernel.ts`, `routes/sse.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/kernel/state` | Kernel ring + policy state. |
| POST | `/api/v1/kernel/hotpatch` | Hotpatch a kernel module. |
| GET | `/api/v1/sse/events` | Server-sent event stream (SSE bridge). |

## Orchestration & Agents (`routes/agents.ts`, `routes/a2a.ts`, `routes/automation.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/agents` | List agents. |
| POST | `/api/v1/agents/:id/task` | Enqueue a task (kernel `enqueueTask`). |
| GET | `/api/v1/agents/:id/state` | Agent runtime state. |
| POST | `/api/v1/a2a/send` | A2A signed envelope dispatch. |
| GET | `/api/v1/viz/:workflowId` | DAG / workflow visualisation SSE (Atlas). |

## Security & Audit (`routes/audit-routes.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/audit/log` | Append-only audit log (hash-chained). |
| GET | `/api/v1/audit/analytics` | Audit analytics. |
| POST | `/api/v1/audit/compliance-report` | Generate compliance report. |

## Self-Optimization (`routes/self-opt.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/self-opt/status` | Auto-tuner control-plane status. |
| POST | `/api/v1/self-opt/tune` | Apply a tuning recommendation. |

## Enterprise (`routes/enterprise.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/enterprise/orgs` | List orgs/tenants. |
| GET | `/api/v1/enterprise/mesh` | Federated mesh status. |

## Marketplace & Skills (`routes/marketplace-routes.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/marketplace/skills` | List marketplace skills. |
| POST | `/api/v1/marketplace/skills/:id/install` | Install a skill. |
| GET | `/api/v1/skills` | List installed skills. |

## Performance & Analytics (`routes/perf.ts`, `routes/analytics.ts`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/perf/metrics` | Runtime metrics. |
| GET | `/api/v1/analytics/recall` | Recall analytics. |

## MCP
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mcp` | MCP JSON-RPC endpoint (`mcp.ts` / `mcp-http.ts`). |
| GET | `/mcp/sse` | MCP SSE transport. |

---

### Notes
- Exact parameter shapes live in the route handlers; this table is an index, not a full schema.
- `routes/v3-upgrade.ts` exposes `/api/v3/*` upgrade shims (mocked `federatedStats` in tests).
- SSE paths (`/api/v1/sse/events`, `/api/v1/viz/:workflowId`) stream `text/event-stream`.
