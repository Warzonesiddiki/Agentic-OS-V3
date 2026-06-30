# NEXUS V3 — Dependency Graph & Test Plan
## Exact Task Ordering. Every Test. Every Assertion.

> **Purpose:** This document defines the precise dependency chain between all 17 phases and their tasks, plus the complete test specification. A low-level AI can execute tasks in the correct order, know exactly what to test after each task, and never create circular dependencies.

---

## PART 1: PHASE DEPENDENCY GRAPH

```
Phase 0  (Foundation Audit)
   │
   ▼
Phase 1  (Core Stabilization)
   │
   ├─────────────────────────────────────────────┐
   ▼                                             │
Phase 2  (Agent Engine)                          │
   │                                             │
   ├─────────────────────────┐                   │
   ▼                         ▼                   │
Phase 3 (Multi-LLM)    Phase 4 (Memory/RAG)      │
   │                         │                   │
   └──────────┬──────────────┘                   │
              ▼                                  │
         Phase 5  (Orchestration)                │
              │                                  │
              ├──────────────────────┐           │
              ▼                      ▼           │
         Phase 6 (Plugin SDK)  Phase 7 (UI)     │
              │                      │           │
              └──────────┬───────────┘           │
                         ▼                      │
                    Phase 8 (Integrations)       │
                         │                      │
                         ├──────────┐           │
                         ▼          ▼           │
                    Phase 9 (Obs) Phase 10 (Sec)│
                         │          │           │
                         └────┬─────┘           │
                              ▼                 │
                         Phase 11 (Deploy)       │
                              │                 │
                              ▼                 │
                         Phase 12 (Advanced)     │
                              │                 │
                              ▼                 │
                         Phase 13 (Project Intel)│
                              │                 │
                              ▼                 │
                         Phase 14 (Interop) ─────┘
                              │
                              ▼
                         Phase 15 (Self-improve)
                              │
                              ▼
                         Phase 16 (Registry)
                              │
                              ▼
                         Phase 17 (Arch Intel)
```

**Key rule:** No phase can start until ALL upstream phases are complete. However, downstream phases can be planned and designed while upstream phases execute (design ahead, implement behind).

---

## PART 2: TASK-LEVEL DEPENDENCY TABLE

Each task below has: `[depends_on] → [task_id]`. Execute only when all dependencies are complete.

### Phase 0 Tasks
| Task | ID | Depends On |
|---|---|---|
| Verify toolchain | 0.0 | — |
| Install dependencies | 0.1 | 0.0 |
| First compilation attempt | 0.2 | 0.1 |
| Catalog files | 0.3 | 0.2 |
| Map API routes | 0.4 | 0.3 |
| Map DB tables | 0.5 | 0.3 |
| Discover 13 features | 0.6 | 0.4, 0.5 |
| Document findings | 0.7 | 0.6 |
| Tag issues for Phase 1 | 0.8 | 0.7 |

### Phase 1 Tasks
| Task | ID | Depends On |
|---|---|---|
| Fix server compilation | 1.1 | 0.8 |
| Fix DB initialization | 1.2 | 0.8 |
| Wire feature 1: Auth | 1.3 | 1.1, 1.2 |
| Wire feature 2: Agents | 1.4 | 1.3 |
| Wire feature 3: Memory | 1.5 | 1.3 |
| Wire feature 4-13 | 1.6 | 1.3 |
| Add error boundaries (FE) | 1.7 | 1.6 |
| Integration tests | 1.8 | 1.7 |
| Logging | 1.9 | 1.1 |

### Phase 2 Tasks
| Task | ID | Depends On |
|---|---|---|
| Agent lifecycle engine | 2.1 | 1.8 |
| Single-agent execution | 2.2 | 2.1 |
| Sequential multi-agent | 2.3 | 2.2 |
| Role-based agent def | 2.4 | 2.1 |
| Tool execution | 2.5 | 2.1 |
| Streaming responses | 2.6 | 2.2 |
| Basic memory | 2.7 | 2.1 |
| Agent persistence | 2.8 | 2.7 |

### Phase 3 Tasks
| Task | ID | Depends On |
|---|---|---|
| Provider abstraction | 3.1 | 1.8 |
| OpenAI provider | 3.2 | 3.1 |
| Anthropic provider | 3.3 | 3.1 |
| Google provider | 3.4 | 3.1 |
| Ollama provider | 3.5 | 3.1 |
| Groq provider | 3.6 | 3.1 |
| DeepSeek provider | 3.7 | 3.1 |
| Together provider | 3.8 | 3.1 |
| Azure provider | 3.9 | 3.1 |
| Bedrock provider | 3.10 | 3.1 |
| Model routing | 3.11 | 3.2-3.10 |
| Failover | 3.12 | 3.11 |
| Cost tracking | 3.13 | 3.11 |
| Budget enforcement | 3.14 | 3.13 |
| Token stats | 3.15 | 3.13 |

### Phase 4 Tasks
| Task | ID | Depends On |
|---|---|---|
| Episodic memory | 4.1 | 2.8 |
| Semantic memory | 4.2 | 2.8 |
| Three-tier memory | 4.3 | 4.1, 4.2 |
| Vector store integration | 4.4 | 4.1 |
| Document ingestion | 4.5 | 4.4 |
| Multi-format support | 4.6 | 4.5 |
| Hybrid search | 4.7 | 4.5 |
| KB management UI | 4.8 | 4.5 |
| Cross-session persistence | 4.9 | 4.3 |
| Memory consolidation | 4.10 | 4.9 |

### Phase 5 Tasks
| Task | ID | Depends On |
|---|---|---|
| Graph orchestration engine | 5.1 | 2.3, 2.5 |
| Conditional branching | 5.2 | 5.1 |
| Parallel execution | 5.3 | 5.1 |
| Hierarchical workflow | 5.4 | 5.3 |
| Handoff patterns | 5.5 | 5.2 |
| Human-in-the-loop | 5.6 | 5.1 |
| Shared task queue | 5.7 | 5.1 |
| YAML/JSON workflow def | 5.8 | 5.1 |
| Checkpointing | 5.9 | 5.7 |

### Phase 6 Tasks
| Task | ID | Depends On |
|---|---|---|
| Plugin SDK package | 6.1 | 1.8 |
| Plugin manifest system | 6.2 | 6.1 |
| Plugin hook system | 6.3 | 6.2 |
| Plugin skill system | 6.4 | 6.3 |
| Plugin loader | 6.5 | 6.2 |
| Plugin sandbox | 6.6 | 6.5 |
| Plugin store | 6.7 | 6.5 |
| 50+ built-in tools | 6.8 | 2.5 |
| MCP protocol support | 6.9 | 6.5 |
| OpenAPI tool import | 6.10 | 6.9 |

### Phase 7 Tasks
| Task | ID | Depends On |
|---|---|---|
| Main dashboard | 7.1 | 1.6 |
| Agent management UI | 7.2 | 2.4 |
| Chat interface | 7.3 | 2.6 |
| Memory browser | 7.4 | 4.1 |
| Knowledge base UI | 7.5 | 4.8 |
| Tool management UI | 7.6 | 6.8 |
| Workflow visualizer | 7.7 | 5.1 |
| Settings UI | 7.8 | 1.8 |
| Cost dashboard UI | 7.9 | 3.13 |
| Plugin management UI | 7.10 | 6.5 |
| Audit log viewer | 7.11 | 1.7 |
| Scheduled jobs UI | 7.12 | 2.8 |
| Webhook config UI | 7.13 | 9.6 |
| API key management | 7.14 | 1.4 |
| Team/user management | 7.15 | 1.4 |

### Phase 8-17 Tasks
| Task | ID | Depends On |
|---|---|---|
| Slack integration | 8.1 | 6.9 |
| Discord integration | 8.2 | 6.9 |
| Telegram integration | 8.3 | 6.9 |
| Email integration | 8.4 | 6.9 |
| GitHub integration | 8.5 | 6.9 |
| Google integration | 8.6 | 6.9 |
| WhatsApp integration | 8.7 | 6.9 |
| 100+ connector library | 8.8 | 8.1-8.7 |
| Web search integration | 8.9 | 6.8 |
| DB connectors | 8.10 | 6.8 |
| Cron job engine | 8.11 | 2.8 |
| Full tracing | 9.1 | 2.1 |
| Agent run timeline | 9.2 | 9.1 |
| Debug mode | 9.3 | 9.1 |
| Cost/performance dashboards | 9.4 | 3.13 |
| Alerting rules | 9.5 | 9.1 |
| Logs explorer | 9.6 | 1.7 |
| Docker sandbox | 10.1 | 6.6 |
| Permission system | 10.2 | 1.4 |
| Guardrails | 10.3 | 6.9 |
| Rate limiting | 10.4 | 1.1 |
| Secrets management | 10.5 | 10.2 |
| Audit trail | 10.6 | 1.7 |
| API authentication | 10.7 | 1.4 |
| Docker Compose | 11.1 | 10.1 |
| CLI | 11.2 | 1.8 |
| REST API | 11.3 | 1.8 |
| Python SDK | 11.4 | 11.3 |
| SaaS deployment | 11.5 | 11.1 |
| Health checks | 11.6 | 11.1 |
| Backup/restore | 11.7 | 11.1 |
| Visual builder | 12.1 | 7.7 |
| Plugin marketplace | 12.2 | 6.1 |
| Agent marketplace | 12.3 | 2.4 |
| A2A protocol | 12.4 | 6.9 |
| Federated memory | 12.5 | 4.9 |
| Voice interface | 12.6 | 3.1 |
| Multimodal | 12.7 | 3.1 |
| Embeddable widget | 12.8 | 7.3 |
| Self-improvement loop | 12.9 | 3.3 |
| Template library | 12.10 | 2.4 |
| 300+ connectors | 12.11 | 8.8 |
| Codebase indexer | 13.1 | 8.5 |
| Git history analyzer | 13.2 | 8.5 |
| Codebase Q&A | 13.3 | 4.7 |
| PR auto-review | 13.4 | 13.1 |
| Linear MCP connector | 13.5 | 8.8 |
| GitHub MCP connector | 13.6 | 8.5 |
| All Phase 13 features | 13.7-13.28 | 13.1-13.6 |
| A2A Agent Card | 14.1 | 12.4 |
| All Phase 14 features | 14.2-14.12 | 14.1 |
| Self-improvement loop | 15.1 | 12.9 |
| All Phase 15 features | 15.2-15.10 | 15.1 |
| Local agent registry | 16.1 | 2.4 |
| All Phase 16 features | 16.2-16.7 | 16.1 |
| Architecture drift | 17.1 | 13.1 |
| All Phase 17 features | 17.2-17.7 | 17.1 |

---

## PART 3: CRITICAL PATH

The critical path (longest chain of dependencies) determines minimum project duration:

```
0.0 → 0.1 → 0.2 → 0.3 → 0.4 → 0.5 → 0.6 → 0.7 → 0.8
  → 1.1 → 1.2 → 1.3 → 1.6 → 1.7 → 1.8
    → 2.1 → 2.2 → 2.3
      → 5.1 → 5.3 → 5.4
        → [no dependency on Phase 5 for downstream]
      → 3.1 → 3.11 → 3.12 → 3.13
      → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6
        → 8.1-8.7 → 8.8
          → 13.5 → 13.6 → 13.7-13.28
            → 14.1 → 14.2-14.12
              → 15.1 → 15.2-15.10
                → 16.1 → 16.2-16.7
                  → 17.1 → 17.2-17.7
```

**Critical path length:** ~64 weeks (matches the roadmap exactly).

**Parallel work opportunities:**
- Phase 3 (Multi-LLM) can run in parallel with Phase 4 (Memory/RAG) — both depend only on Phase 1
- Phase 6 (Plugin SDK) can run in parallel with Phase 7 (UI) — different teams
- Phase 8 (Integrations) can run in parallel with Phase 9 (Observability) + Phase 10 (Security)
- Phase 12 (Advanced) runs parallel to Phase 13 (Project Intelligence) after Phase 11

---

## PART 4: TEST SPECIFICATION

### Test Philosophy
1. **Every API route must have 3 tests:** happy path, error path, edge case
2. **Every agent behavior must have 1 test:** expected output for given input
3. **Every frontend component must have 1 test:** renders without error
4. **Integration tests must cover:** full request → response cycle for every route
5. **E2E tests cover:** critical user journeys only (login → create agent → run → view result)

### Test Categories

| Category | Tool | Coverage | When |
|---|---|---|---|
| Unit (server) | Vitest | 80%+ of all functions | Every Phase |
| Integration (server) | Vitest + supertest | 100% of API routes | Every Phase |
| Component (frontend) | Vitest + React Testing Library | 60%+ of components | Phases 7, 12, 13 |
| E2E | Playwright | 10 critical journeys | Phase 11+ |
| Performance | k6/autocannon | P95 < 500ms | Phase 11 |
| Security | OWASP ZAP | All auth endpoints | Phase 10 |

### Per-Phase Test Requirements

#### Phase 0 — Audit Tests
```typescript
// Verify compilation succeeds (baseline after fixes)
describe('Phase 0: Server Compilation', () => {
  it('should compile without errors', async () => {
    const result = await exec('npx tsc --noEmit');
    expect(result.exitCode).toBe(0);
  });
  it('should start without crashing', async () => {
    const server = spawn('npx', ['tsx', 'src/index.ts']);
    await waitForPort(3000, 10000);
    expect(server.exitCode).toBeNull(); // Still running
    server.kill();
  });
});
```

#### Phase 1 — Route Tests (100+ tests)
```typescript
// Pattern for every route:
describe('POST /api/v1/auth/login', () => {
  const validCredentials = { email: 'test@test.com', password: 'Password1!' };
  
  it('should return 200 with token for valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(validCredentials);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('test@test.com');
  });
  
  it('should return 401 for invalid password', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ ...validCredentials, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  
  it('should return 400 for missing email', async () => {
    const res = await request(app).post('/api/v1/auth/login')
      .send({ password: 'Password1!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

#### Phase 2 — Agent Engine Tests
```typescript
describe('Agent Lifecycle Engine', () => {
  it('should execute think→act→observe loop', async () => {
    const agent = createTestAgent({ model: 'test', tools: ['echo'] });
    const result = await agent.run({ input: 'say hello' });
    expect(result.status).toBe('completed');
    expect(result.thoughts.length).toBeGreaterThan(0);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(0);
  });
  
  it('should handle tool errors gracefully', async () => {
    const agent = createTestAgent({ model: 'test', tools: ['failing_tool'] });
    const result = await agent.run({ input: 'do something' });
    expect(result.status).toBe('completed'); // Should not crash
    expect(result.errors).toBeDefined();
  });
  
  it('should timeout on long-running tasks', async () => {
    const agent = createTestAgent({ model: 'test', timeout: 1 });
    const result = await agent.run({ input: 'think for 10 seconds' });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('timeout');
  });
});
```

#### Phase 3 — Multi-LLM Tests
```typescript
describe('Provider Abstraction', () => {
  it('should switch providers without changing agent code', async () => {
    const openaiResult = await llm.complete({ provider: 'openai', prompt: 'say hi' });
    const anthropicResult = await llm.complete({ provider: 'anthropic', prompt: 'say hi' });
    expect(openaiResult.content).toBeDefined();
    expect(anthropicResult.content).toBeDefined();
  });
  
  it('should failover to secondary provider on primary failure', async () => {
    const result = await llm.complete({
      provider: 'openai',
      failoverProvider: 'anthropic',
      prompt: 'say hi'
    });
    expect(result.provider).toBe('anthropic'); // Because mock makes OpenAI fail
  });
});
```

#### Phase 4 — Memory Tests
```typescript
describe('Memory System', () => {
  it('should store and retrieve episodic memories', async () => {
    await memory.store({ type: 'episodic', content: 'user said hello', agentId: 'a1' });
    const memories = await memory.recall({ agentId: 'a1', limit: 10 });
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe('user said hello');
  });
  
  it('should find semantically similar memories', async () => {
    await memory.store({ type: 'semantic', content: 'The sky is blue', embedding: [...] });
    const results = await memory.search({ query: 'color of the sky', limit: 5 });
    expect(results[0].similarity).toBeGreaterThan(0.8);
  });
});
```

#### Phase 5 — Orchestration Tests
```typescript
describe('Workflow Orchestration', () => {
  it('should execute sequential workflow step by step', async () => {
    const workflow = createSequentialWorkflow([agentA, agentB, agentC]);
    const result = await workflow.execute({ input: 'start' });
    expect(result.steps[0].agent).toBe('agentA');
    expect(result.steps[1].agent).toBe('agentB');
    expect(result.steps[2].agent).toBe('agentC');
    expect(result.status).toBe('completed');
  });
  
  it('should pause and resume on human input', async () => {
    const workflow = createWorkflowWithHumanGate();
    const result = await workflow.execute({ input: 'needs approval' });
    expect(result.status).toBe('awaiting_input');
    const resumed = await workflow.continue({ approval: true });
    expect(resumed.status).toBe('completed');
  });
});
```

#### Phase 6 — Plugin SDK Tests
```typescript
describe('Plugin System', () => {
  it('should load and execute plugin skills', async () => {
    const plugin = await pluginLoader.load('test-plugin');
    const result = await plugin.execute('hello', { name: 'world' });
    expect(result).toBe('Hello, world!');
  });
  
  it('should isolate plugins in sandbox', async () => {
    const plugin = await pluginLoader.load('malicious-plugin');
    await expect(plugin.execute('delete-system', {})).rejects.toThrow('permission denied');
  });
});
```

#### Phase 11 — E2E Tests (Playwright)
```typescript
// 10 critical user journeys:
describe('Critical Journeys', () => {
  test('Login → Create Agent → Run → View Result', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'admin@test.com');
    await page.fill('[data-testid="password"]', 'Password1!');
    await page.click('[data-testid="login-btn"]');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    
    await page.click('[data-testid="create-agent-btn"]');
    await page.fill('[data-testid="agent-name"]', 'Test Agent');
    await page.fill('[data-testid="agent-role"]', 'Assistant');
    await page.fill('[data-testid="agent-goal"]', 'Help with testing');
    await page.click('[data-testid="save-agent-btn"]');
    await expect(page.locator('[data-testid="agent-list"]')).toContainText('Test Agent');
    
    await page.click('[data-testid="run-agent-btn"]');
    await page.fill('[data-testid="task-input"]', 'Say hello world');
    await page.click('[data-testid="submit-task-btn"]');
    await expect(page.locator('[data-testid="task-result"]')).toBeVisible({ timeout: 30000 });
  });
});
```

---

## PART 5: TEST RUNNER CONFIGURATION

### Server Unit Tests
```powershell
# Run all unit tests
cd server
npx vitest run

# Run specific test file
npx vitest run -- tests/auth.test.ts

# Run with coverage
npx vitest run -- --coverage

# Run in watch mode (dev)
npx vitest
```

### Server Integration Tests
```powershell
cd server
npx vitest run --config vitest.integration.config.ts
```

### Frontend Tests
```powershell
# From root
npx vitest run

# Component tests
npx vitest run -- src/components/
```

### E2E Tests (Phase 11+)
```powershell
cd server
npx playwright test
```

### Full Test Suite (CI)
```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      - run: cd server && npx vitest run
      - run: npx vitest run
      - run: cd server && npx vitest run --config vitest.integration.config.ts
```

---

## PART 6: TEST COVERAGE REQUIREMENTS BY PHASE

| Phase | Minimum Coverage | Focus Areas |
|---|---|---|
| 0 | N/A (audit only) | N/A |
| 1 | 60% | API routes, auth, error boundaries |
| 2 | 70% | Agent lifecycle, tool execution, streaming |
| 3 | 75% | Provider abstraction, routing, failover |
| 4 | 70% | Memory operations, RAG pipeline, search |
| 5 | 70% | Graph execution, branching, parallel, checkpointing |
| 6 | 65% | Plugin loading, sandbox, tools |
| 7 | 50% (hard to test DOM) | Critical components, chat, dashboard |
| 8 | 60% | Each connector end-to-end |
| 9 | 70% | Tracing, metrics, alerting |
| 10 | 80% | Auth, permissions, sandbox, guardrails |
| 11 | 50% | E2E critical journeys |
| 12 | 60% | Visual builder, A2A, voice |
| 13 | 60% | Codebase indexing, PR review |
| 14 | 70% | A2A protocol, agent cards |
| 15 | 70% | Self-improvement loop, A/B testing |
| 16 | 60% | Registry, discovery, routing |
| 17 | 60% | Architecture drift, ownership mapping |

---

## PART 7: TEST DATA FIXTURES

```typescript
// server/tests/fixtures.ts — Shared test fixtures
export const testUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@nexus.io',
  password: 'TestPass123!',
  name: 'Test User',
  role: 'admin' as const,
};

export const testAgent = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Test Agent',
  slug: 'test-agent',
  role: 'assistant',
  goal: 'Help with testing',
  model: 'gpt-4o-mini', // Cheaper model for tests
  provider: 'openai',
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: 'You are a helpful test agent.',
  tools: ['echo', 'web_search'],
};

export const testMemory = {
  id: '00000000-0000-0000-0000-000000000020',
  type: 'episodic',
  content: 'Test memory content',
  importance: 5,
  tags: ['test', 'fixture'],
};

export const testProject = {
  id: '00000000-0000-0000-0000-000000000030',
  name: 'Test Project',
  slug: 'test-project',
  description: 'A test project',
};

// Reset database between test suites
export async function resetTestDb() {
  // Truncate all tables in reverse dependency order
  await db.execute(sql`TRUNCATE TABLE 
    anchored_roots, merkle_checkpoints, audit_log,
    compiled_scripts, sandbox_executions, state_snapshots,
    agent_tasks, cron_jobs, agents,
    tool_receipts, trajectory_logs,
    feedback, token_ledger,
    memories, notes, skills, api_keys, system_meta,
    projects
    RESTART IDENTITY CASCADE`);
}

// Seed minimal test data
export async function seedTestData() {
  // Create default admin user
  await db.insert(projects).values(testProject);
  await db.insert(agents).values(testAgent);
}
```

---

## PART 8: PERFORMANCE BENCHMARKS

| Benchmark | Target | Tool | Phase |
|---|---|---|---|
| API response time (p95) | < 200ms | autocannon | 1 |
| Agent startup time | < 500ms | vitest perf | 2 |
| LLM call (cached) | < 100ms | custom metric | 3 |
| LLM call (first) | < 2000ms | custom metric | 3 |
| Memory search (10k records) | < 50ms | benchmark test | 4 |
| RAG search (100k chunks) | < 200ms | benchmark test | 4 |
| Workflow 10-step execution | < 5000ms | benchmark test | 5 |
| Plugin load time | < 100ms | benchmark test | 6 |
| Dashboard render | < 500ms | Lighthouse | 7 |
| SSE message latency | < 50ms | custom metric | 2 |
| Concurrent agent execution (10) | < 30s | stress test | 5 |
| Docker sandbox startup | < 2000ms | benchmark test | 10 |
| DB migration (100 tables) | < 10s | drizzle-kit | 0 |
| Audit log insert (10k/sec) | < 1s batch | benchmark test | 10 |

---

## PART 9: CONTINUOUS INTEGRATION

```yaml
# .github/workflows/ci.yml — Updated
name: NEXUS CI
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint server
        run: cd server && npx eslint src/
      - name: Lint frontend
        run: npx eslint src/
      
  unit-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: nexus_test }
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - run: cd server && npm ci
      - run: npx vitest run
      
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: nexus_test }
    steps:
      - uses: actions/checkout@v4
      - run: cd server && npm ci
      - run: npx vitest run --config vitest.integration.config.ts
      
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd server && npm ci && npx tsc --noEmit
      - run: npm ci && npx vite build
```

---

## PART 10: BLUEPRINT FOR ANY AI TO EXECUTE

When a low-level AI receives a task from any phase, it should:

```
1. READ this document → find the task ID and its dependencies
2. VERIFY all dependencies are complete (check status in the tracking system)
3. READ the phase document → find the task specification
4. READ all relevant source files → understand current state
5. IMPLEMENT the changes following the spec
6. RUN the specified test file → verify changes work
7. UPDATE the status to "completed"
8. IF tests fail → DIAGNOSE → FIX → RETEST (max 3 attempts)
9. IF still failing after 3 attempts → DOCUMENT the issue → MARK as blocked
```

This pattern repeats identically for every task across every phase.
