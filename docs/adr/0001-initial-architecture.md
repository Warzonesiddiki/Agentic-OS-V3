# 0001 – Initial Architecture

**Status:** Final
**Author:** Atlas
**Date:** 2026-06-30

## Context
NEXUS 2.0 aims to run 50 agents with a kernel, runtime, memory tiers, skill registry, UI, and P2P swarm. Existing code provides core modules (`server/src`, `src`, `frontend`). Need unified build, CI, Docker, and skill registry.

## Decision
- Keep monorepo layout.
- Use `npm ci` for dependencies.
- Build backend (`server`) and frontend (`src`) separately.
- Deploy via Docker Compose (backend + PostgreSQL + Prometheus).
- Skill registry lives in `src/skill-registry.ts` and loads manifests from `skills/` folder.

## Consequences
- CI runs lint, type‑check, tests, builds Docker images.
- Dockerfile for backend copies `server/` and `package.json`.
- Dockerfile for frontend copies `src/` and builds with Vite.
- Skill registry can be extended without core changes.
