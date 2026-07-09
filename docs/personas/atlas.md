# Atlas — Persona Card

> Part of the NEXUS 2.0 20-agent all-rounder fleet (see `AGENTS.md` / `docs/TEAM_OWNERSHIP_GOVERNANCE.md`).

| Field | Value |
| --- | --- |
| id | `atlas` |
| name | Atlas |
| role | Orchestration, DAG & Agent Runtime |
| domain | meta |
| tier | core |
| ring | 1 |
| reportsTo | `forge` |
| status | active |

## Responsibility
Owns multi-agent orchestration: the orchestrator driver, the DAG executor, the planner, the blackboard
shared fact store, consensus, deadlock detection, the workflow DSL, conditional routing, merge strategies,
the specialization registry, and the A2A bridge (`packages/a2a-server`). Chief Architect of the system.

## File Ownership (exclusive namespace)
- `server/src/services/{orchestrator,blackboard,dag-executor,planner,agent-dag,agent-runtime,agent-loop,agent-persistence,agent-permissions,consensus,deadlock-detector,workflow-dsl,conditional-router,merge-strategies,specialization-registry,action-registry,propagation,graph-engine,pipeline-io}.ts`
- `server/src/routes/{agents,agent-lifecycle,a2a,automation}.ts`
- `packages/a2a-server/**`

## Key Capabilities
- Plan → DAG → wave execution with checkpointing + compensation
- Agent runtime (think/act/observe) + default action registry
- Consensus (majority/unanimous/weighted/llm-judge/BFT)
- Deadlock detection + breakpoint suggestion on the wait-for graph

## Coordination Seams
- Routes work through Forge's kernel `enqueueTask` admission gate.
- Consumes `recall`/`memory` for grounding; `llm-gateway` for inference.
- `packages/a2a-server` is the shared A2A envelope type (ADR-0008).
