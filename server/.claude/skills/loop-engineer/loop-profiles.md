# Loop Profiles — Autonomous Coding Loop Templates

## PROFILE 1 — bug_fix

**topology**: simple | **loop_type**: closed
**trigger_keywords**: [fix bug, fix error, fix failing test, debug, exception, traceback, broken, crash, TypeError, AttributeError, undefined, null]

**mcp_chain**:
1. mcp__filesystem → read error file and relevant source files
2. mcp__git → check recent commits that may have introduced the bug
3. mcp__context7 → fetch framework/library docs for error type
4. mcp__filesystem → apply fix
5. mcp__sandbox → run test suite (deterministic verifier)
6. mcp__snyk → quick security check on changed code
7. mcp__git → commit with descriptive message if tests pass
8. mcp__github → open PR with bug description and fix explanation

**verifier**: deterministic — tests pass (exit 0) + linter clean + snyk no new critical
**max_iter**: 10 | **token_budget_per_cycle**: 8000 | **context_reset**: false
**failure_mode_watch**: [oscillation between two states, hallucinated fix that passes linter but breaks runtime behavior]

## PROFILE 2 — feature_build

**topology**: plan_execute | **loop_type**: closed
**trigger_keywords**: [build feature, implement, add functionality, create component, new endpoint, new screen, new module, implement spec, build this]

**mcp_chain**:
1. mcp__github → read issue/spec/acceptance criteria
2. mcp__context7 → fetch up-to-date docs for all frameworks used
3. mcp__filesystem → read existing codebase structure and patterns
4. mcp__figma → get design specs if UI work involved
5. mcp__filesystem → scaffold new files following existing patterns
6. mcp__filesystem → implement feature logic
7. mcp__postgres OR mcp__sqlite → run any required migrations
8. mcp__sandbox → run unit tests
9. mcp__playwright → run e2e tests
10. mcp__sonarqube → quality gate check
11. mcp__snyk → dependency + code security check
12. mcp__docker → build image to confirm no container issues
13. mcp__git → commit
14. mcp__github → open PR with full feature description

**verifier**: deterministic (all tests pass + sonarqube gate passes) → then llm_judge (separate agent reviews code quality vs project patterns)
**max_iter**: 25 | **token_budget_per_cycle**: 15000 | **context_reset**: every 10 cycles
**failure_mode_watch**: [context degradation from long sessions, implementing feature without checking existing patterns → style drift]

## PROFILE 3 — full_stack_project

**topology**: ralph (MANDATORY — fresh instance every cycle) | **loop_type**: closed
**trigger_keywords**: [build project, build app, full stack, entire codebase, from scratch, build everything, complete implementation, whole system]

**mcp_chain (per cycle — runs fresh each time)**:
1. mcp__github → read spec/remaining tasks from STATE.md + issue tracker
2. mcp__context7 → fetch relevant framework docs for this cycle's task only
3. mcp__filesystem → read only files relevant to this cycle's single task
4. mcp__filesystem → implement ONE task from STATE.md
5. mcp__sandbox → run tests for changed code only
6. mcp__git → commit with task reference
7. mcp__task_mgmt → update task status in STATE.md

**ralph_rule**: Each cycle does exactly ONE task from STATE.md. Instance dies after commit. New instance reads STATE.md and picks next task. Context never accumulates. This is intentional.

**verifier**: maker_checker — build_agent (this instance) → review_agent (fresh instance with adversarial instructions, reads diff + tests)
**max_iter**: 100 | **token_budget_per_cycle**: 12000 | **context_reset**: EVERY CYCLE
**failure_mode_watch**: [ralph instance picking same task twice — prevent with atomic STATE.md task locking, review_agent approving low-quality work — give it explicit adversarial instructions and rubric]

## PROFILE 4 — security_audit

**topology**: nested | **loop_type**: closed
**trigger_keywords**: [security audit, vulnerability scan, find CVEs, pentest, security review, check for vulns, OWASP, injection, auth bypass, scan code]

**mcp_chain**:
1. mcp__filesystem → read full codebase structure
2. mcp__semgrep → static analysis security scan
3. mcp__snyk → dependency vulnerability scan
4. mcp__sonarqube → code quality and security metrics
5. mcp__supply_chain → CVE check + typosquatting detection
6. mcp__sandbox → test known vulnerability patterns safely
7. mcp__filesystem → write structured findings report
8. mcp__github → open security advisory if critical findings
9. mcp__jira → create remediation tickets for each finding

**verifier**: deterministic — zero critical vulns in snyk + semgrep + zero sonarqube security hotspots unaddressed
**max_iter**: 15 | **token_budget_per_cycle**: 10000 | **context_reset**: false
**failure_mode_watch**: [false negatives from single scanner — always run minimum 3 scanning tools, remediation introducing new vulns — rescan after every fix]

## PROFILE 5 — deploy_pipeline

**topology**: plan_execute | **loop_type**: closed
**trigger_keywords**: [deploy, ship, release, push to prod, rollout, kubernetes apply, helm upgrade, go live, promote to staging]

**mcp_chain**:
1. mcp__git → get latest commit hash and changelog
2. mcp__sandbox → run full test suite one final time
3. mcp__docker → build and tag image with commit hash
4. mcp__snyk → container image vulnerability scan (block if critical)
5. mcp__kubernetes → apply manifests to target environment
6. mcp__kubernetes → wait for rollout complete + health checks
7. mcp__grafana → verify key metrics stable (error rate, latency, CPU/memory) for 3 minutes post-deploy
8. mcp__slack → post deployment notification with commit, version, metrics
9. mcp__jira → transition deploy ticket to Done

**rollback_trigger**: if step 7 fails (metrics degrade) → mcp__kubernetes rollout undo → mcp__slack notify rollback → STOP

**verifier**: deterministic — all pods Running + metrics within SLO thresholds
**max_iter**: 8 | **token_budget_per_cycle**: 6000 | **context_reset**: false
**failure_mode_watch**: [proceeding past failed health check, container scan finding critical vuln that gets ignored — hard block on critical snyk findings]

## PROFILE 6 — api_development

**topology**: plan_execute | **loop_type**: closed
**trigger_keywords**: [build API, REST API, GraphQL, new endpoints, API spec, OpenAPI, Swagger, design API, implement routes, API server]

**mcp_chain**:
1. mcp__openapi → parse spec if provided, else generate spec from requirements
2. mcp__filesystem → read existing API patterns in codebase
3. mcp__context7 → fetch framework docs (FastAPI/Express/etc)
4. mcp__filesystem → generate route handlers and validators
5. mcp__postgres OR mcp__sqlite → create migrations if data model changed
6. mcp__sandbox → run unit tests for each endpoint
7. mcp__postman → run integration test collection against live endpoints
8. mcp__snyk → security scan focused on injection and auth
9. mcp__filesystem → generate/update API documentation
10. mcp__git → commit
11. mcp__github → open PR

**verifier**: deterministic — all endpoints return correct status codes in postman collection + unit tests pass + spec validation clean
**max_iter**: 15 | **token_budget_per_cycle**: 10000 | **context_reset**: false
**failure_mode_watch**: [implementing endpoints without input validation, breaking existing API contracts — always run postman collection against ALL endpoints not just new ones]

## PROFILE 7 — refactor

**topology**: ralph | **loop_type**: closed
**trigger_keywords**: [refactor, clean up, modernize, extract function, reduce duplication, improve code quality, DRY, tech debt, restructure]

**mcp_chain (per cycle)**:
1. mcp__code_search → find all instances of the pattern to refactor
2. mcp__filesystem → refactor ONE file or ONE pattern instance
3. mcp__sandbox → run tests (must pass — no behavior change allowed)
4. mcp__sonarqube → check quality delta (must improve or stay same)
5. mcp__git → commit with specific refactor description

**ralph_rule**: One file or one pattern per cycle. Commit before ending instance. New instance picks next instance from the list discovered in step 1.

**verifier**: deterministic — tests pass + sonarqube quality score did not decrease + zero behavior change (before/after output identical)
**max_iter**: 50 | **token_budget_per_cycle**: 8000 | **context_reset**: EVERY CYCLE
**failure_mode_watch**: [behavior change disguised as refactor — require identical test outputs before and after, scope creep — one file per cycle maximum, no exceptions]

## PROFILE 8 — incident_response

**topology**: simple | **loop_type**: closed
**trigger_keywords**: [production down, outage, incident, alert fired, service degraded, spike in errors, SLA breach, pages firing, on-call]

**mcp_chain**:
1. mcp__grafana → pull active alerts, error rate, latency, saturation
2. mcp__kubernetes → get pod status, recent events, resource usage
3. mcp__kubernetes → tail logs from affected services
4. mcp__k8s_network → capture traffic sample if needed
5. mcp__filesystem → analyze log patterns for root cause
6. mcp__kubernetes → apply immediate mitigation (scale, restart, rollback)
7. mcp__grafana → verify mitigation working (metrics recovering)
8. mcp__slack → post incident update with timeline and current status
9. mcp__jira → create incident ticket with full root cause analysis
10. mcp__github → open fix PR if code change required

**urgent_rules**:
- Speed over elegance. Ship mitigation first, clean fix second.
- Every action must be logged with timestamp — incident timeline is critical artifact.
- If unsure: scale up first, investigate second.
- Human escalation gate if mitigation not working after 3 cycles.

**verifier**: deterministic — grafana alerts resolved + error rate back within SLO + all pods Running
**max_iter**: 10 | **token_budget_per_cycle**: 5000 | **context_reset**: false
**failure_mode_watch**: [applying fix that masks symptoms without finding root cause, not notifying stakeholders fast enough — slack update is mandatory every 2 cycles]