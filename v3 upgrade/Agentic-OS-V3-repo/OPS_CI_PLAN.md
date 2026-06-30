# NEXUS 2.0 — Ops & CI Plan
**Author:** Bastion · DevOps Engineer
**File:** `OPS_CI_PLAN.md`
**Status:** Draft v1 — awaiting Atlas's MASTER_SPEC §8 for iteration
**Date:** 2026-06-29

---

## 1. Repo Layout

### Recommendation: **Monorepo with workspace isolation**

```
nexus/
├── .github/
│   └── workflows/          # Shared CI templates (reusable across apps)
├── apps/
│   ├── kernel/             # Forge territory — OS/kernel core
│   ├── runtime/            # Pulse territory — runtime services
│   ├── memory/            # Mnemosyne — memory services
│   ├── tools/              # Artisan — tool services
│   ├── frontend/          # Prism — UI/frontend
│   └── docs/              # Lorekeeper — docs site
├── infra/
│   ├── terraform/          # Cloud IaC (AWS EKS / GCP GKE / Azure AKS)
│   ├── helm/              # Helm charts per service
│   └── k8s/               # Kustomize overlays (dev/staging/prod)
├── ops/
│   ├── scripts/           # Operational scripts
│   ├── runbooks/          # Per-incident runbooks
│   └── docker/            # Dockerfiles, compose, base images
├── Makefile               # One-command local bring-up
└── nexus-ops-plan.md      # This document
```

**Rationale:**
- **Atomic cross-service commits** — a single PR can touch kernel + runtime + memory atomically, eliminating version skew.
- **Shared CI templates** in `.github/workflows/` prevent pipeline drift across 6+ services.
- **Workspace tools** (Nx, Bazel, or Cargo/Bun workspaces) cache per-app builds — CI is fast even at 50-agent scale.
- **Single `Makefile`** at root means `make up`, `make test-all`, `make down` work uniformly.
- **Atlas's MASTER_SPEC** drives the canonical service inventory — this layout is designed to absorb it cleanly.

---

## 2. CI Pipeline Stages

**Runner:** GitHub Actions (`ubuntu-latest` for Linux workloads; `macos-latest` for any macOS toolchain)
**Rationale:** Native GitHub integration, matrix builds, secrets management, and tight coupling with GitHub Enterprise + Codespaces. Widest team familiarity.

### Pipeline: `lint → unit → integration → sentinel-eval → build → deploy-staging → deploy-prod`

```yaml
name: NEXUS CI

on:
  push:
    branches: [main, 'release/**']
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/nexus

jobs:
  # ── Stage 1: Lint & Format ──────────────────────────────────────────
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: make lint-all
      - uses: reviewdog/action-golangci-lint@v2      # Go linting
      - uses: eslint-actions/eslint@v3               # JS/TS linting
      - uses: ruff-ai/ruff-action@v3                  # Python linting (if any)

  # ── Stage 2: Unit Tests ─────────────────────────────────────────────
  unit:
    name: Unit Tests (${{ matrix.app }})
    needs: lint
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        app: [kernel, runtime, memory, tools, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: make test-${{ matrix.app }}
      - uses: codecov/codecov-action@v4
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: unit-results-${{ matrix.app }}
          path: coverage/

  # ── Stage 3: Integration Tests ───────────────────────────────────────
  integration:
    name: Integration Tests
    needs: unit
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
      redis:
        image: redis:7
      kafka:
        image: confluentinc/cp-kafka:7
    steps:
      - uses: actions/checkout@v4
      - run: make integration-all
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: integration-results
          path: test-results/

  # ── Stage 4: Sentinel QA Gate ───────────────────────────────────────
  sentinel-eval:
    name: Sentinel QA Gate
    needs: integration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Sentinel evaluation suite
        run: |
          make sentinel-eval \
            EVAL_TARGET=nexus-staging \
            EVAL_TOKEN=${{ secrets.SENTINEL_EVAL_TOKEN }}
      - name: Publish Sentinel report
        uses: actions/upload-artifact@v4
        with:
          name: sentinel-report
          path: reports/sentinel/
      # Blocking gate: fail pipeline if Sentinel pass rate < 95%
      - name: Check Sentinel pass rate
        run: |
          RATE=$(cat reports/sentinel/pass-rate.txt)
          if (( $(echo "$RATE < 0.95" | bc -l) )); then
            echo "Sentinel pass rate $RATE < 0.95 — blocking merge"
            exit 1
          fi

  # ── Stage 5: Build & Push Images ────────────────────────────────────
  build:
    name: Build & Push (${{ matrix.app }})
    needs: sentinel-eval   # QA must pass before any image is built
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        app: [kernel, runtime, memory, tools, frontend, docs]
    outputs:
      tags: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}-${{ matrix.app }}
          tags: |
            type=sha,prefix=,suffix=,format=short
            type=ref,event=branch
            type=semver,pattern={{version}}
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build & push (multi-stage, distroless, signed)
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.app }}
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true
      - name: Sign image with Cosign
        if: github.ref == 'refs/heads/main'
        uses: sigstore/cosign-installer@v3
        run: |
          cosign sign \
            --yes \
            --certificate-identity "https://github.com/${{ github.repository }}" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            ${{ env.IMAGE_PREFIX }}-${{ matrix.app }}:${{ github.sha }}

  # ── Stage 6: Deploy → Staging ────────────────────────────────────────
  deploy-staging:
    name: Deploy → Staging
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via Helm
        run: |
          helm upgrade --install nexus-${{ matrix.app }} \
            ./infra/helm/nexus/${{ matrix.app }} \
            --namespace nexus-staging \
            --values ./infra/k8s/overlays/staging/${{ matrix.app }}.yaml \
            --set image.tag=${{ github.sha }} \
            --wait --timeout 5m
        env:
          KUBECONFIG_DATA: ${{ secrets.STAGING_KUBECONFIG }}

  # ── Stage 7: Deploy → Production ─────────────────────────────────────
  deploy-prod:
    name: Deploy → Production
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Promote to production
        run: |
          helm upgrade --install nexus-${{ matrix.app }} \
            ./infra/helm/nexus/${{ matrix.app }} \
            --namespace nexus-prod \
            --values ./infra/k8s/overlays/prod/${{ matrix.app }}.yaml \
            --set image.tag=${{ github.sha }} \
            --wait --timeout 10m
        env:
          KUBECONFIG_DATA: ${{ secrets.PROD_KUBECONFIG }}
```

### Gate Summary
```
lint → unit → integration → sentinel-eval → build → deploy-staging → deploy-prod
      ↑─ fail-fast ──↑                              ↑
                                              (prod gate: manual approval
                                               + branch == main)
```

---

## 3. Local One-Command Bring-Up

### Docker Compose (full stack — dev + local smoke-test)

```yaml
# ops/docker/docker-compose.yml
version: '3.9'

services:
  # ── Core NEXUS services ───────────────────────────────────────────
  kernel:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-kernel:latest
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks: [nexus]

  runtime:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-runtime:latest
    depends_on: [kernel, memory]
    environment:
      KERNEL_ADDR: kernel:9090
      MEMORY_ADDR: memory:6379
    networks: [nexus]

  memory:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-memory:latest
    ports: ["6379:6379"]
    networks: [nexus]

  tools:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-tools:latest
    depends_on: [runtime]
    networks: [nexus]

  frontend:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-frontend:latest
    ports: ["3000:3000"]
    depends_on: [runtime]
    networks: [nexus]

  docs:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-docs:latest
    ports: ["8080:8080"]
    networks: [nexus]

  # ── Observability stack ───────────────────────────────────────────
  prometheus:
    image: prom/prometheus:v2.50
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ["9090:9090"]
    networks: [nexus]

  grafana:
    image: grafana/grafana:10.4
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    ports: ["3001:3000"]
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning
    depends_on: [prometheus]
    networks: [nexus]

  loki:
    image: grafana/loki:2.9
    ports: ["3100:3100"]
    networks: [nexus]

  tempo:
    image: grafana/tempo:2.4
    ports: ["4317:4317", "4318:4318"]
    networks: [nexus]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.97
    volumes:
      - ./otel-collector.yaml:/etc/otelcol-contrib/config.yaml
    ports: ["4317:4317", "8888:8888"]
    networks: [nexus]

  # ── Sentinel QA ───────────────────────────────────────────────────
  sentinel:
    image: ${IMAGE_PREFIX:-ghcr.io/nexus}/nexus-sentinel:latest
    environment:
      EVAL_TARGET: http://frontend:3000
    depends_on: [frontend]
    networks: [nexus]

networks:
  nexus:
    driver: bridge
```

### Makefile targets

```makefile
# Makefile

.PHONY: up down logs clean test-all lint-all integration

# ── Bring-up ──────────────────────────────────────────────────────
up:
	@echo "🚀 Starting NEXUS 2.0..."
	cp ops/docker/.env.example ops/docker/.env 2>/dev/null || true
	docker compose -f ops/docker/docker-compose.yml up -d --remove-orphans
	@echo "✅ NEXUS live — Grafana: http://localhost:3001 | Docs: http://localhost:8080"

down:
	docker compose -f ops/docker/docker-compose.yml down

logs:
	docker compose -f ops/docker/docker-compose.yml logs -f

clean: down
	docker compose -f ops/docker/docker-compose.yml rm -vf
	docker image prune -f

# ── Testing ────────────────────────────────────────────────────────
test-all:
	docker compose -f ops/docker/docker-compose.yml exec kernel make test
	docker compose -f ops/docker/docker-compose.yml exec runtime make test

lint-all:
	@find . -name "*.go"   | xargs golangci-lint run || true
	@find . -name "*.ts"   | xargs eslint --max-warnings 0 || true
	@find . -name "*.py"   | xargs ruff check || true

integration:
	docker compose -f ops/docker/docker-compose.yml exec kernel make integration
```

```bash
make up          # Full stack — one command
make logs        # Tail all service logs
make test-all    # Smoke-test across all services
make down        # Tear down cleanly
```

---

## 4. Container Strategy

### Base Images
| Service | Builder Image | Runtime Image | Rationale |
|---|---|---|---|
| Go (kernel, runtime) | `golang:1.22-alpine` | `gcr.io/distroless/static-debian12` | Minimal CVE surface |
| Node (frontend, tools) | `node:22-alpine` | `gcr.io/distroless/nodejs-debian12` | Distroless Node runtime |
| Python (any) | `python:3.12-slim-bookworm` | `python:3.12-slim-bookworm` + pip audit | Controlled base |
| Docs | `node:22-alpine` | `nginx:alpine` | Static file server |

### Multi-Stage Dockerfile Pattern (Go service)

```dockerfile
# ── Stage 1: Build ─────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -trimpath \
    -o service

# ── Stage 2: Distroless runtime ────────────────────────────────────
FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /build/service /service
ENTRYPOINT ["/service"]
```

### Image Signing & Provenance
- **Cosign** (Sigstore) signs every image on push to `main`.
- GitHub OIDC identity used — no long-lived secrets.
- CI verifies signatures before deploying:
  ```bash
  cosign verify \
    --certificate-identity "https://github.com/nexus/nexus" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    ghcr.io/nexus/nexus-kernel:$SHA
  ```

### SBOM Generation
- **Syft** generates SBOM on every build.
- **Grype** scans SBOM for CVEs — blocks deploy if critical CVE found.
- SBOM attached as image attestation (OCI spec).

---

## 5. Observability Stack

### Architecture
```
Services (OTel SDK)
  → OTel Collector (DaemonSet / Sidecar)
    → Prometheus   (metrics)      → AlertManager → PagerDuty
    → Loki         (logs)
    → Tempo        (traces)
    → Grafana      (single pane of glass — dashboards)
```

### OTel Collector Config
```yaml
# ops/docker/otel-collector.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  prometheus:
    config:
      scrape_configs:
        - job_name: 'nexus-services'
          static_configs:
            - targets: ['kernel:9090', 'runtime:9090', 'memory:9090',
                        'tools:9090', 'frontend:9090']

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"

  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [prometheus, otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loki]
```

### Prometheus Config
```yaml
# ops/docker/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  - job_name: 'nexus'
    static_configs:
      - targets: ['kernel:9090', 'runtime:9090', 'memory:9090',
                   'tools:9090', 'frontend:9090']
```

### Alert Rules (key SLO-aligned alerts)
```yaml
# ops/docker/alert_rules.yml
groups:
  - name: nexus-slos
    rules:
      - alert: ServiceDown
        expr: up{job="nexus"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.instance }} is down"

      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Error rate > 1% on {{ $labels.service }}"

      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m])) > 500
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "p99 latency > 500ms on {{ $labels.service }}"

      - alert: SentinelEvalFailing
        expr: sentinel_eval_pass_rate < 0.95
        for: 0m
        labels:
          severity: blocking
        annotations:
          summary: "Sentinel pass rate below 95% — blocking CI gate"
```

### Grafana Dashboards (provisioned as code)
- **Pipeline Health** — deploy frequency, success rate, rollback rate
- **Service Latency** — p50/p95/p99 per service
- **Error Rate** — 4xx/5xx breakdown per service
- **Resource Usage** — CPU/memory per pod
- **Sentinel QA** — eval pass rate, failure categories

---

## 6. Secrets Handling

### Principle: **Never env vars in prod. Never secrets in repo.**

### Strategy: HashiCorp Vault + SOPS + K8s SealedSecrets

### Layer 1 — Vault (dynamic credentials in CI)

```yaml
# In GitHub Actions CI — never stored, rotated dynamically
- name: Fetch secrets from Vault
  uses: hashicorp/vault-action@v3
  with:
    url: https://vault.nexus.internal
    method: jwt
    role: nexus-ci
    secrets: |
      secret/data/nexus/prod/database | DB_PASSWORD
      secret/data/nexus/prod/redis     | REDIS_PASSWORD
      secret/data/nexus/prod/jwt       | JWT_SECRET
```

### Layer 2 — SOPS (file-at-rest encryption)

```yaml
# ops/secrets/sops.yaml — committed as sops.yaml
creation_rules:
  - path_regex: .*\\.yaml$
    encrypted_regex: "^(data|stringData)$"
    pgp: >-
      KEY_FP_1,
      KEY_FP_2
    age: age1xxxxxxx   # for cluster decryption
```

**Secrets committed as `*.enc.yaml` — decrypt in CI, never in repo in plaintext.**

```bash
# Encrypt a secret
sops --encrypt --age age1xxx \
  --pgp KEY_FP_1 \
  secrets/prod-db.enc.yaml

# Decrypt in CI
sops --decrypt secrets/prod-db.enc.yaml > secrets/prod-db.yaml
```

### Layer 3 — K8s SealedSecrets (cluster-at-rest)

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: nexus-db-credentials
  namespace: nexus-prod
spec:
  encryptedData:
    password: AgA...    # sealed by CI; unsealed only inside cluster
    username: AgB...
  template:
    metadata:
      name: nexus-db-credentials
      namespace: nexus-prod
```

### Layer 4 — No plaintext env vars in Dockerfiles

```dockerfile
# ✅ Good — secret file mounted at runtime
ENV DB_PASSWORD_FILE=/run/secrets/db_password

# ❌ Never — secret in image layer, visible in history
ENV DB_PASSWORD=supersecret
```

---

## 7. Runbook Template

```markdown
# Runbook: <INCIDENT_NAME>
**Severity:** [SEV-1 | SEV-2 | SEV-3]
**Service:** <affected service(s)>
**On-call:** <name>
**Started:** <ISO timestamp>
**Status:** [INVESTIGATING | MITIGATED | RESOLVED]

---

## 📍 Alert
> "<full alert text from AlertManager / Grafana"

**Alert firing since:** <timestamp>
**Dashboard:** <link>
**SLO impact:** <availability / latency / error rate>

---

## 🔍 Diagnosis

### 1. Check symptoms
- [ ] **Metrics:** Prometheus → <service> → <metric> (paste current value)
- [ ] **Logs:** `docker compose -f ops/docker/docker-compose.yml logs <service> --tail=200`
  ```
  <paste relevant log lines>
  ```
- [ ] **Traces:** Tempo — trace ID from error log → <link>
- [ ] **Deploy history:** `helm list -n nexus-prod` — last revision, status

### 2. Identify blast radius
- [ ] Which agents/services are impacted?
- [ ] Is this user-facing? (frontend / API impact)
- [ ] Is data integrity at risk? (database writes, message queue lag)
- [ ] How many users affected?

### 3. Root cause hypothesis
> _<Describe hypothesis based on symptoms>_

---

## 🛠️ Mitigation (execute in order; stop when symptoms resolve)

| Step | Action | Verify | Who |
|------|--------|--------|-----|
| 1 | `helm rollback <app> -n nexus-prod` | Error rate drops | <on-call> |
| 2 | Scale replicas: `kubectl scale deploy/<app> -n nexus-prod --replicas=10` | Latency recovers | <on-call> |
| 3 | Feature flag: `ff disable <feature>` | Symptoms stop | <on-call> |
| 4 | Drain traffic: `kubectl cordon node` + `kubectl drain node` | Service recovers on new node | <on-call> |

---

## 🔄 Recovery Verification

- [ ] SLOs back to green (Grafana dashboards)
- [ ] No data loss: Kafka consumer lag < 1000 offsets
- [ ] No stale cache: Redis `INFO stats` — evictions == 0
- [ ] `helm list -n nexus-prod` — all deployments `deployed`
- [ ] #nexus-incidents notified: "Incident RESOLVED — <summary>"

---

## 📋 Postmortem (within 48 hours of resolution)

### Timeline
| Time | Event |
|------|-------|
| <HH:MM> | Alert fires |
| <HH:MM> | On-call acknowledges |
| <HH:MM> | Root cause identified |
| <HH:MM> | Mitigation applied |
| <HH:MM> | SLOs restored |

### Root cause
> _<detailed description>_

### What went well
- _<item>_

### What went poorly
- _<item>_

### Action items
| Priority | Action | Owner | Due |
|----------|--------|-------|-----|
| P1 | Add regression test for this failure mode | <name> | <date> |
| P2 | Add chaos engineering scenario to testbed | <name> | <date> |
| P2 | Update this runbook with new learnings | <name> | <date> |

---

## 🔒 Lessons & Hardening

> *"If recovery isn't tested, recovery doesn't exist."*

- [ ] **Test recovery:** Run `helm rollback` in staging this week — document outcome
- [ ] **Chaos test:** Add failure injection for this scenario to Sentinel eval suite
- [ ] **SLO adjustment:** Does current SLO need revision based on this incident?
- [ ] **Runbook updated:** This template is versioned — bump if changed

---
*Runbook version: 1.0 | NEXUS 2.0 Ops Team | Bastion 🏰*
```

---

## Open Questions (for Leader / Atlas)

1. **CI Runner OS:** Ubuntu-latest assumed. Any services requiring `macos-latest` or Windows containers? (e.g., native toolchain builds)
2. **Vault cluster:** Does an existing HashiCorp Vault instance exist, or should we provision one? Who holds the root token?
3. **Deployment target:** AWS EKS, GCP GKE, or Azure AKS? Terraform modules will differ significantly — needs Leader + Atlas sign-off before I can finalize `infra/terraform/`.

---

*Standing by for Atlas's MASTER_SPEC §8 and Leader direction. 🏰*
