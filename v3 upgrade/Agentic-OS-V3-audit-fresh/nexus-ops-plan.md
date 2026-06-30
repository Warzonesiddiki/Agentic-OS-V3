# NEXUS 2.0 — Ops & CI Plan
**Author:** Bastion · DevOps Engineer
**Status:** Draft v1 — pending Atlas's MASTER_SPEC §8
**Date:** 2026-06-29

---

## 1. Repo Layout

### Recommendation: **Monorepo with workspace isolation**

```
nexus/
├── .github/
│   └── workflows/          # Shared CI templates
├── apps/
│   ├── kernel/             # Forge territory — OS/kernel core
│   ├── runtime/            # Pulse territory — runtime services
│   ├── memory/             # Mnemosyne — memory services
│   ├── tools/              # Artisan — tool services
│   ├── frontend/           # Prism — UI/frontend
│   └── docs/               # Lorekeeper — docs site
├── infra/
│   ├── terraform/          # Cloud IaC (AWS/GCP/Azure)
│   ├── helm/               # Helm charts per service
│   └── k8s/                # Kustomize overlays (dev/staging/prod)
├── ops/
│   ├── scripts/            # Operational scripts
│   ├── runbooks/           # Per-incident runbooks
│   └── docker/             # Dockerfiles, compose, base images
├── .github/workflows/     # CI pipelines (lint → unit → integration → eval → build → deploy)
└── Makefile               # One-command local bring-up
```

**Rationale:**
- Single source of truth; atomic cross-service commits.
- Shared CI templates in `.github/workflows/` reduce drift.
- Workspace tools (Nx, Bazel, or Cargo workspace) cache per-app — fast builds.
- Atlas's MASTER_SPEC drives the canonical service list → this layout scales to 50 agents.

---

## 2. CI Pipeline (GitHub Actions)

Triggered on `push` + `pull_request` to `main`.

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
      - uses: actions/setup-node@v4  # or python/setup-python, etc.
      - run: make lint-all           # targets per app
      - uses: reviewdog/action-golangci-lint@v2  # go
      - uses: eslint-actions/eslint@v3             # js/ts

  # ── Stage 2: Unit Tests ─────────────────────────────────────────────
  unit:
    name: Unit Tests
    needs: lint
    runs-on: ubuntu-latest
    strategy:
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
    name: Integration
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
      - name: Publish QA report
        uses: actions/upload-artifact@v4
        with:
          name: sentinel-report
          path: reports/sentinel/

  # ── Stage 5: Build & Publish Images ─────────────────────────────────
  build:
    name: Build & Push Images
    needs: sentinel-eval       # Gate: QA must pass
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app: [kernel, runtime, memory, tools, frontend, docs]
    outputs:
      image-tags: ${{ steps.meta.outputs.tags }}
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
      - name: Build & push (multi-stage, distroless)
        uses: docker/build-push-action@v5
        with:
          context: ./apps/${{ matrix.app }}
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true

  # ── Stage 6: Deploy ─────────────────────────────────────────────────
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

  deploy-prod:
    name: Deploy → Production
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Promote from staging + deploy
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

**Gate summary:** `lint → unit → integration → sentinel-eval → build → deploy-staging → deploy-prod`

---

## 3. Local One-Command Bring-Up

### Docker Compose (dev + local smoke-test)

```yaml
# ops/docker/docker-compose.yml
version: '3.9'
services:
  # Core services
  kernel:
    image: ${IMAGE_PREFIX}-kernel:latest
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  runtime:
    image: ${IMAGE_PREFIX}-runtime:latest
    depends_on: [kernel, memory]
    environment:
      KERNEL_ADDR: kernel:9090
      MEMORY_ADDR: memory:6379

  memory:
    image: ${IMAGE_PREFIX}-memory:latest
    ports: ["6379:6379"]

  tools:
    image: ${IMAGE_PREFIX}-tools:latest
    depends_on: [runtime]

  frontend:
    image: ${IMAGE_PREFIX}-frontend:latest
    ports: ["3000:3000"]
    depends_on: [runtime]

  docs:
    image: ${IMAGE_PREFIX}-docs:latest
    ports: ["8080:8080"]

  # Observability stack
  prometheus:
    image: prom/prometheus:v2.50
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports: ["9090:9090"]

  grafana:
    image: grafana/grafana:10.4
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    ports: ["3001:3000"]
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning

  loki:
    image: grafana/loki:2.9
    ports: ["3100:3100"]

  tempo:
    image: grafana/tempo:2.4
    ports: ["4317:4317", "4318:4318"]

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.97
    volumes:
      - ./otel-collector.yaml:/etc/otelcol-contrib/config.yaml
    ports: ["4317:4317", "8888:8888"]

  # Sentinel QA
  sentinel:
    image: ${IMAGE_PREFIX}-sentinel:latest
    environment:
      EVAL_TARGET: http://frontend:3000
    depends_on: [frontend]
```

### Makefile (one-command bring-up)

```makefile
# Makefile

.PHONY: up down logs test-all clean lint-all integration

# ── Bring-up ──────────────────────────────────────────────
up:
	@echo "🚀 Starting NEXUS 2.0 stack..."
	cp ops/docker/.env.example ops/docker/.env 2>/dev/null || true
	docker compose -f ops/docker/docker-compose.yml up -d --remove-orphans
	@echo "✅ NEXUS is live. Grafana: http://localhost:3001 | Docs: http://localhost:8080"

down:
	docker compose -f ops/docker/docker-compose.yml down -v

logs:
	docker compose -f ops/docker/docker-compose.yml logs -f

clean: down
	docker compose -f ops/docker/docker-compose.yml rm -vf
	docker image prune -f

# ── Testing ───────────────────────────────────────────────
test-all:
	docker compose -f ops/docker/docker-compose.yml exec kernel make test
	docker compose -f ops/docker/docker-compose.yml exec runtime make test

lint-all:
	@find . -name "*.go"   | xargs golangci-lint run || true
	@find . -name "*.ts"  | xargs eslint --max-warnings 0 || true
	@find . -name "*.py"  | xargs ruff check || true

integration:
	docker compose -f ops/docker/docker-compose.yml exec kernel make integration
```

**Usage:**
```bash
make up          # Bring up everything
make logs        # Tail all logs
make test-all    # Run tests across all services
make down        # Tear down
```

---

## 4. Container Strategy

### Base Images
| Component | Base Image | Rationale |
|---|---|---|
| Go services | `golang:1.22-alpine` → distroless `gcr.io/distroless/static` | Minimal attack surface |
| Node services | `node:22-alpine` → `gcr.io/distroless/nodejs-debian12` | Distroless Node |
| Python services | `python:3.12-slim` → custom distroless | If needed |
| Debian fallback | `debian:bookworm-slim` | when distroless unavailable |

### Multi-Stage Dockerfile Pattern (Go example)

```dockerfile
# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -trimpath \
    -o service

# Stage 2: Distroless runtime
FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /build/service /service
ENTRYPOINT ["/service"]
```

### Image Signing
- Use **Cosign** (Sigstore) to sign every image on push.
- Verify signatures in CI before deploy:
  ```yaml
  - name: Verify image signature
    run: |
      cosign verify \
        --certificate-identity-regexp="https://github.com/${{ github.repository }}" \
        --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
        ${{ env.IMAGE_PREFIX }}-kernel:${{ github.sha }}
  ```

### SBOM (Software Bill of Materials)
- Generate via `docker/sbom` on every build (Syft + Grype).
- Attach SBOM to image metadata for vulnerability traceability.

---

## 5. Observability Stack

### Architecture

```
Services → OTel Collector → Prometheus (metrics)
                        → Loki (logs)
                        → Tempo (traces)
                        → AlertManager → PagerDuty

Grafana (single pane of glass): dashboards for all signals
```

### Prometheus + Grafana
- Scrape config per service via `otel-collector` → Prometheus
- Grafana provisioned via config-as-code (`infra/grafana/provisioning/`)
- Key dashboards: **Pipeline Health**, **Service Latency**, **Error Rate**, **Resource Usage**

### OpenTelemetry
- All services instrumented with OTel SDK
- Collector as sidecar + daemonset in K8s
- Context propagation across all 50 agents

### Key Metrics (SLO-aligned)
| SLO | Metric | Alert threshold |
|---|---|---|
| Availability | `up{job="nexus-*"}` | < 99.9% |
| Latency | `p99 request_duration_ms` | > 500ms |
| Error rate | `error_rate` | > 1% |
| Deploy success | `deploy_success_total` | < 100% on staging |
| Sentinel pass rate | `sentinel_eval_pass_rate` | < 95% |

---

## 6. Secrets Handling

### Principle: **Never env vars in prod. Never secrets in repo.**

### Strategy: HashiCorp Vault + SOPS

**Architecture:**
```
GitHub Actions → Vault (dynamic creds) → K8s secrets (SealedSecrets) → Pod
                SOPS-encrypted files (at-rest)
```

**Step 1 — Vault (dynamic secrets):**
```bash
# In CI, fetch prod creds from Vault
- name: Fetch secrets from Vault
  uses: hashicorp/vault-action@v3
  with:
    url: https://vault.nexus.internal
    method: jwt
    role: nexus-ci
    secrets: |
      secret/data/nexus/prod/database | DB_PASSWORD
      secret/data/nexus/prod/redis     | REDIS_PASSWORD
```

**Step 2 — SOPS for file-based secrets (infra configs):**
```bash
# ops/secrets/sops.yaml
creation_rules:
  - path_regex: .*.yaml$
    encrypted_regex: "^(data|stringData)$"
    pgp: KEY_FP_1, KEY_FP_2
    age: age1xxx   # for K8s config
```
Secrets committed as `secrets.enc.yaml` — decrypts in CI, never checked into plain text.

**Step 3 — K8s SealedSecrets:**
```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: nexus-db-credentials
spec:
  encryptedData:
    password: AgA...  # sealed by CI, unsealed only by cluster
```

**Step 4 — No plaintext env vars in Dockerfiles:**
```dockerfile
# ✅ Good
ENV DB_PASSWORD_FILE=/run/secrets/db_password

# ❌ Never
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
> "<full alert text from AlertManager>"

## 🔍 Diagnosis
1. **Check symptoms:**
   - [ ] Grafana: <dashboard URL>
   - [ ] Logs: `kubectl logs -n nexus-prod -l app=<app> --tail=200`
   - [ ] Traces: Tempo — find trace ID from error log

2. **Identify blast radius:**
   - [ ] Which agents/services are impacted?
   - [ ] User-facing error rate?
   - [ ] Data integrity risk?

3. **Root cause hypothesis:**
   > _<describe hypothesis>_

## 🛠️ Mitigation (execute in order)
| Step | Action | Verify |
|------|--------|--------|
| 1 | `kubectl rollout undo deployment/<app>` | Error rate drops |
| 2 | Scale up replicas: `kubectl scale deployment/<app> --replicas=10` | Latency recovers |
| 3 | Feature flag: `ff disable <feature>` | Symptoms stop |

## 🔄 Recovery
- [ ] Verify SLOs back to green (Grafana)
- [ ] Confirm no data loss (check Kafka consumer lag)
- [ ] Notify #nexus-incidents Slack channel

## 📋 Postmortem (within 48h)
- **Root cause:** 
- **What went well:** 
- **What went poorly:** 
- **Action items:**
  - [ ] 
  - [ ] 

## 🔒 Lessons & Hardening
> _If recovery isn't tested, recovery doesn't exist._
> - [ ] Add regression test for this failure mode
> - [ ] Add chaos engineering scenario
> - [ ] Update this runbook
```

---

## 🚦 Next Steps (pending Atlas's MASTER_SPEC §8)

1. **Align repo layout** with final service inventory from Atlas.
2. **Refine Helm charts** per deployment target (AWS EKS / GCP GKE / Azure AKS).
3. **Confirm Vault cluster** endpoint with Leader + Forge.
4. **Define SLOs** per service (to be inserted into Prometheus alerting rules).
5. **Integrate Sentinel eval results** into GitHub PR status checks (blocking merge if < 95% pass rate).

> **Bastion standing by** for Atlas's MASTER_SPEC §8 to iterate. All tooling choices above are directional — to be confirmed against actual service requirements. Deployments are not events; they are a continuous state of readiness. 🏰
