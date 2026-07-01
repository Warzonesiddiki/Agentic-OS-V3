# MCP Registry — Model Context Protocol Servers

## CATEGORY: developer_tools

**Servers**:
- github (@modelcontextprotocol/server-github, GITHUB_TOKEN, critical)
- filesystem (@modelcontextprotocol/server-filesystem, none, critical)
- git (mcp-server-git, ssh_key|token, critical)
- code_search (greptile|sourcegraph, api_key, high)
- context7 (context7-mcp, none, critical — always use for framework docs, never rely on training data for library APIs)
- memory (mcp-memory-server, none, high — persistent agent memory store)
- multi_model (multi-model-orchestrator, api_keys, high)
- 19_skills_suite (claude-skills-suite, none, high)

## CATEGORY: api_development

**Servers**:
- openapi_mcp (openapi-mcp, none, high)
- fastmcp (fastmcp, none, high)
- postman (postman-mcp, POSTMAN_API_KEY, high)
- rest_client (web-inspector-mcp, none, medium)

## CATEGORY: database

**Servers**:
- sqlite (mcp-server-sqlite, none, high)
- postgres (mcp-server-postgres, conn_string, high)
- mysql (mcp-server-mysql, conn_string, high)
- universal_db (haymon-database, conn_string, high — single binary for MySQL|MariaDB|PostgreSQL|SQLite)
- elasticsearch (es-mcp, api_key, medium)
- influxdb (influxdb-mcp, token, medium — read-only Flux API)
- redis (redis-mcp, conn_string, medium)

## CATEGORY: security

**Servers**:
- snyk (snyk-cli-mcp, SNYK_TOKEN, critical — run on every PR)
- semgrep (semgrep-mcp, none, high — static analysis)
- sandbox (sandbox-mcp, none, critical — ALWAYS use for untrusted/AI-gen code)
- sonarqube (sonarqube-mcp, token, high)
- supply_chain (supply-chain-mcp, none, high — CVEs + typosquat detection)
- security_tools (security-tools-mcp, none, high — SQLMap/FFUF/NMAP/MobSF)
- kali (awesome-kali-mcp, none, high — requires Docker)
- virustotal (virustotal-mcp, VT_API_KEY, medium)
- ghidra (ghidra-mcp, none, medium — reverse engineering)
- jadx (jadx-mcp, none, medium — Android APK decompilation)
- metasploit (metasploit-mcp, none, medium)

**SECURITY_WARNING**: 36.7% of MCP servers are SSRF-vulnerable, 41% require no auth, only 8.5% use OAuth. Vet every server before connecting. Never log auth tokens. Use OAuth first. Isolate credentials.

## CATEGORY: browser_automation

**Servers**:
- playwright (playwright-mcp, none, critical — primary browser tool)
- chrome_devtools (chrome-devtools-mcp, none, high)
- browserbase (browserbase-mcp, BB_API_KEY, high — cloud browser)
- web_eval (web-eval-mcp, none, high — evaluate/debug web apps)
- fetch (fetch-mcp, none, high — headless fetch + JS exec)

## CATEGORY: web_scraping

**Servers**:
- firecrawl (firecrawl-mcp, FC_API_KEY, high)
- brave_search (brave-search-mcp, BRAVE_KEY, high)
- web_reader (web-reader-mcp, none, high — clean markdown from any URL)

## CATEGORY: deployment_devops

**Servers**:
- docker (docker-mcp, none, critical)
- kubernetes (kubectl-mcp-server, kubeconfig, critical — 26 built-in skills covering k8s-core|networking|storage|deploy|operations|helm|diagnostics|troubleshoot|incident|security|policy|certs|gitops)
- terraform (terraform-mcp, cloud_creds, high)
- cloudflare (cloudflare-mcp, CF_TOKEN, high — Workers/KV/R2/D1)
- vercel (vercel-mcp, VERCEL_TOKEN, high)
- aws (aws-mcp, AWS_CREDS, high)
- cicd (cicd-mcp, token, high — GitHub Actions + build monitoring)

## CATEGORY: cloud_infrastructure

**Servers**:
- aws_docs (aws-docs-mcp, none, high — always use for AWS patterns)
- grafana (grafana-mcp, GRAFANA_TOKEN, high — dashboards/Prometheus/alerts)
- firefly (firefly-mcp, FF_TOKEN, medium)

## CATEGORY: monitoring_observability

**Servers**:
- grafana (grafana-mcp, token, high)
- greptimedb (greptimedb-mcp, conn_string, medium — unified metrics/logs/traces)
- kubeshark (kubeshark-mcp, kubeconfig, medium — L4/L7 traffic analysis)
- cypress (cypress-mcp, token, medium)

## CATEGORY: productivity_workflow

**Servers**:
- task_mgmt (task-mgmt-mcp, none, high)
- jira_confluence (atlassian-mcp, ATLASSIAN_TOKEN, high)
- slack (slack-mcp, SLACK_TOKEN, high)
- discord (discord-mcp, BOT_TOKEN, medium)
- email (email-mcp, SMTP_CREDS, high)
- obsidian (obsidian-mcp, none, medium — knowledge base)
- excel (excel-mcp, none, medium)
- zapier (zapier-mcp, ZAPIER_KEY, high — connects 8000+ apps)

## CATEGORY: data_science_ml

**Servers**:
- rag (rag-mcp, varies, high)
- data_connectors (data-connector-mcp, varies, high)
- docling (docling-mcp, none, medium — unstructured→structured)
- pdf (pdf-mcp, none, medium)

## CATEGORY: design

**Servers**:
- figma (figma-mcp, FIGMA_TOKEN, high)
- ui_gen (ui-gen-mcp, none, high)
- drawio (drawio-mcp, none, medium)

## CATEGORY: collaboration

**Servers**:
- slack (slack-mcp, token, high)
- ms_graph (ms-graph-mcp, AZURE_CREDS, medium)
- granola (granola-mcp, token, low — meeting notes)

## MCP WIRING PROTOCOL

1. On loop init: read .mcp-config.json for available servers + auth
2. Health-check each required server before loop starts
3. Map goal → required MCP servers from the selected profile's mcp_chain
4. Confirm auth tokens present for all required servers
5. Per act phase: one tool call → capture output → log → proceed
6. On tool failure: retry once → on second failure: log + skip + adapt
7. Tool selection order: deterministic_local > official_mcp > community_mcp > api_fallback
8. NEVER block entire loop on a single broken MCP tool