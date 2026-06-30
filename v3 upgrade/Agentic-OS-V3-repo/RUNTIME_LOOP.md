# RUNTIME_LOOP.md — Pulse Runtime Loop Reference Design

> **Author:** Pulse (Runtime Engineer)  
> **Date:** 2026-06-29  
> **Status:** Draft v1 — standalone, reconcile with Atlas MASTER_SPEC §3

---

## 1. Canonical Loop Template

**Pick: Hybrid ReAct + Plan-and-Execute**

Pure ReAct is purely reactive — it only course-corrects after a tool fails, which adds latency on every step. Pure Plan-and-Execute is too rigid — a long plan shatters on the first unexpected state change.

The **hybrid** takes the best of both:

```
PLANNING PHASE  (Plan-and-Execute trait)
  1. Receive task + context
  2. Consult Mnemosyne → similar past episodes, learned heuristics
  3. Emit multi-step plan: steps[], goal statement
  4. Emit plan trace

EXECUTION PHASE  (ReAct trait, repeated per step)
  FOR each step in plan:
    5. THINK   — reason about next action
    6. ACT     — invoke tool via Artisan
    7. OBSERVE — parse tool result
    8. REFLECT — update internal state
    9. CHECK   — tool failed? → abort plan, replan from scratch
               — tool ok, state drifted? → patch plan
               — tool ok, state matched? → continue
  END FOR

WRAP-UP
  10. Write episode to Mnemosyne
  11. Emit final structured trace
  12. Return result
```

**Rationale:** Each ReAct step is fast (<500 ms median). Full replan is reserved for hard failures only — avoids the "replan on every step" pathology of pure ReAct while keeping the agent responsive to state changes.

---

## 2. Lifecycle States

```
  init ──► idle ──► thinking ──► acting ──► awaiting ──► done
                            │            │                 ▲
                            ▼            ▼                 │
                         error      error                 │
                            │            │                 │
                            ▼            ▼                 │
                          killed ◄───────┴─────────────────┘
```

| State     | Entry condition                              | Exit condition                          |
|-----------|-----------------------------------------------|-----------------------------------------|
| `init`    | Agent process starts                         | Runtime fully initialized               |
| `idle`    | No task in flight; waiting                   | New task dispatched to me               |
| `thinking`| Task received; planning/reasoning active     | Plan emitted or planning timeout        |
| `acting`  | Tool invocation dispatched to Artisan        | Tool result received                    |
| `awaiting`| Async tool call in flight (long-running tool) | Result returned or timeout/fault         |
| `done`    | All plan steps complete, episode closed      | New task → idle                         |
| `error`   | Tool failure / timeout / safety block         | Retry → replan, or → killed             |
| `killed`  | Leader hard kill / shutdown signal            | Process terminates                       |

**Every transition MUST emit:** `(from_state, to_state, trigger, timestamp, trace_id)`

*Decision heuristic: If you can't see the state, you can't debug it.*

---

## 3. Tool Invocation Contract (Pulse ↔ Artisan)

Artisan owns the tool registry and invocation. Pulse consumes tools as async functions.

### 3.1 Interface Pulse requires from Artisan

```python
from typing import Protocol, Any
from dataclasses import dataclass

@dataclass
class ToolResult:
    ok: bool
    result: Any | None       # structured result from tool
    error: str | None        # error message if not ok
    duration_ms: float       # wall-clock time of tool execution
    metadata: dict | None    # rate-limit hints, retry-after, etc.

class ToolRegistry(Protocol):
    async def invoke(
        self,
        tool_name: str,
        params: dict[str, Any],
        trace_id: str
    ) -> ToolResult:
        """Invoke a registered tool. Always async. Always traced."""
        ...

    def list_tools(self) -> list["ToolSpec"]:
        """Return all registered tools with name + parameter schemas."""
        ...

    def get_schema(self, tool_name: str) -> "ToolSpec":
        """Return parameter schema for a specific tool. Raises KeyError if not found."""
        ...

@dataclass
class ToolSpec:
    name: str
    description: str
    param_schema: dict[str, Any]  # JSON Schema for parameters
    is_async: bool
    suggested_timeout_ms: int | None = None
```

### 3.2 Pulse's responsibilities
- Invoke **one tool at a time** per loop step (no parallel calls within a step — keeps traces clean)
- Always pass `trace_id` on every call
- Respect `ToolResult.metadata.retry_after` and `suggested_timeout_ms`
- Map `ToolResult.ok == False` to the `error` lifecycle state

### 3.3 Artisan's responsibilities
- Register/deregister tools dynamically (hot-reload without restart)
- Enforce tool timeouts; return `ToolResult.ok = False` on timeout
- Propagate `trace_id` into Artisan's own internal spans

---

## 4. Memory Hooks (Pulse ↔ Mnemosyne)

Mnemosyne owns the memory layer. Pulse reads at well-defined boundaries and writes after each episode.

### 4.1 Read hooks — called BEFORE planning (never during execution)

```python
from typing import Protocol
from dataclasses import dataclass

@dataclass
class Episode:
    episode_id: str
    task: str
    plan: list[str]
    steps: list["StepRecord"]
    final_state: str
    total_duration_ms: float
    trace_id: str
    persona_version: str

@dataclass
class StepRecord:
    step: int
    state: str
    thought: str
    tool: str | None
    tool_params: dict | None
    tool_result: ToolResult | None
    duration_ms: float

@dataclass
class PersonaContext:
    persona_id: str
    system_prompt: str
    tool_preferences: dict[str, Any]   # e.g. { "preferred_tools": [...], "retry_policy": "..." }
    heuristics: dict[str, Any]        # learned behavioral patterns

class MemoryReadHooks(Protocol):
    async def retrieve_similar_episodes(
        self,
        task: str,
        k: int = 5
    ) -> list[Episode]:
        """Fetch k most recent similar episodes from episodic memory (vector or keyword search)."""
        ...

    async def get_persona_context(self, persona_id: str) -> PersonaContext:
        """Load active persona configuration + behavioral heuristics."""
        ...

    async def get_long_term_context(self, query: str) -> str:
        """Vector search over accumulated context; returns concatenated relevant chunks."""
        ...
```

### 4.2 Write hooks — called AFTER episode completion

```python
class MemoryWriteHooks(Protocol):
    async def store_episode(self, episode: Episode) -> None:
        """Persist full ReAct trace: task, plan, all steps, result, metrics."""
        ...

    async def update_heuristics(self, episode: Episode) -> None:
        """Extract + store learned patterns from this episode (e.g. tool X failed after Y)."""
        ...

    async def prune_if_needed(self) -> None:
        """Called periodically; Mnemosyne manages its own retention policy."""
        ...
```

### 4.3 Rules
- **Read before planning; write after episode** — never interleaved
- Mnemosyne owns retrieval strategy and retention; Pulse is a consumer
- All memory ops are async

---

## 5. Observability Hooks

Three parallel output streams from every loop iteration.

### 5.1 Structured Traces → for Prism (frontend traces UI)

```json
{
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "episode_id": "661f9511-f30c-52e5-b827-557766551111",
  "agent_id": "pulse-01",
  "task": "list and summarize /docs",
  "plan": ["list_dir /docs", "read_files *.md", "summarize"],
  "steps": [
    {
      "step": 1,
      "state": "thinking",
      "thought": "I need to list the directory first...",
      "tool": null,
      "tool_params": null,
      "tool_result": null,
      "duration_ms": 45
    },
    {
      "step": 2,
      "state": "acting",
      "thought": "Calling filesystem.list_dir",
      "tool": "filesystem.list_dir",
      "tool_params": { "path": "/docs" },
      "tool_result": { "ok": true, "result": ["a.md", "b.md"], "error": null, "duration_ms": 12 },
      "duration_ms": 57
    }
  ],
  "final_state": "done",
  "total_duration_ms": 1840,
  "persona_version": "default-v2"
}
```

### 5.2 Structured Logs → for Sentinel (audit trail)

```json
{
  "level": "INFO",
  "timestamp": "2026-06-29T10:00:00.123Z",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "state_transition",
  "from": "acting",
  "to": "awaiting",
  "trigger": "tool_dispatched",
  "tool": "filesystem.list_dir",
  "step": 2
}
```

**Minimum loggable events:** `state_transition`, `tool_invoked`, `tool_result`, `error_classified`, `replan_triggered`, `episode_closed`.

### 5.3 Metrics → for monitoring dashboards

| Metric                          | Type      | Labels                          |
|---------------------------------|-----------|----------------------------------|
| `loop_iteration_total`          | counter   | `agent_id`, `final_state`        |
| `loop_step_duration_ms`         | histogram | `agent_id`, `step`               |
| `tool_call_total`               | counter   | `agent_id`, `tool_name`, `ok`    |
| `tool_error_rate`               | gauge     | `agent_id`, `tool_name`          |
| `memory_read_latency_ms`        | histogram | `agent_id`, `hook_name`          |
| `memory_write_latency_ms`       | histogram | `agent_id`, `hook_name`          |
| `replan_events_total`           | counter   | `agent_id`, `reason`             |

**Propagation:** `trace_id` flows from loop start → tool call → memory write → final log. Every log entry is queryable by `trace_id`.

---

## 6. Hot-Reload Approach for Persona Swaps

Persona = system prompt template + tool preferences + behavioral heuristics. Swappable at runtime without restart.

### 6.1 Directory structure

```
personas/
  default/
    system_prompt.md
    tool_preferences.yaml
    heuristics.json
  aggressive/
    ...
  cautious/
    ...
```

### 6.2 Reload mechanism

1. A `file_watcher` monitors `personas/<name>/` directories
2. On change detected in active persona's directory:
   - Artisan reloads tool preferences → re-registers preferred tools
   - Mnemosyne reloads heuristics for that persona
   - Pulse reloads `system_prompt.md` into the loop's prompt context
3. In-flight episodes complete with **old** persona (persona version tagged in trace)
4. Next episode starts with **new** persona
5. Brief state transition: `idle → reloading → idle` (~50 ms)

### 6.3 Constraints
- No hard cut-off of running episodes — they finish with their original persona version
- Every trace carries `persona_version` for replay/debugging
- Open tool connections and memory store connections are **not** reloaded (Artisan and Mnemosyne manage those)

### 6.4 Graceful shutdown protocol
```
Leader sends shutdown signal
  → Pulse: finish current episode (do not abort mid-step)
  → Pulse: write final episode to Mnemosyne
  → Pulse: emit "agent_shutdown" log event
  → Pulse: send "shutdown_approved" to Leader
  → Process exits
```

---

## 7. Pseudocode — Reference Implementation (~45 lines)

```python
import asyncio
import uuid
from dataclasses import dataclass, field

@dataclass
class Agent:
    persona_id: str = "default"
    state: str = "idle"
    trace_id: str = ""
    current_episode: dict = field(default_factory=dict)

    async def run(self, task: str, memory, tools, observability):
        self.trace_id = str(uuid.uuid4())
        self.state = "thinking"

        # ── PLANNING PHASE ─────────────────────────────────────────────
        persona_ctx    = await memory.get_persona_context(self.persona_id)
        similar        = await memory.retrieve_similar_episodes(task, k=5)
        long_term_ctx  = await memory.get_long_term_context(task)

        plan = await self.planning_llm(
            task=task,
            similar=similar,
            persona=persona_ctx,
            context=long_term_ctx,
        )

        self.current_episode = {
            "trace_id": self.trace_id,
            "task": task,
            "plan": plan["steps"],
            "steps": [],
        }
        observability.log_state_transition("idle", "thinking", "task_received")
        observability.emit_plan_trace(self.trace_id, plan)

        # ── EXECUTION PHASE ────────────────────────────────────────────
        for step_idx, step in enumerate(plan["steps"]):
            self.state = "thinking"
            thought = await self.reasoning_llm(step, persona_ctx)

            self.state = "acting"
            observability.log_state_transition("thinking", "acting", "tool_invoked")

            result = await tools.invoke(step["tool"], step["params"], self.trace_id)
            self.state = "awaiting" if result.metadata.get("async") else "acting"
            observability.log_tool_result(self.trace_id, step["tool"], result)

            if not result.ok:
                self.state = "error"
                plan = await self.replan(task, plan, result, persona_ctx)
                if plan is None:
                    self.state = "killed"
                    break
                continue

            self.current_episode["steps"].append({
                "step": step_idx, "thought": thought,
                "tool": step["tool"], "result": result,
            })
            self.state = "acting"

        # ── WRAP-UP ───────────────────────────────────────────────────
        self.state = "done"
        await memory.store_episode(self.current_episode)
        observability.emit_trace(self.current_episode)
        observability.log_state_transition(self.state, "idle", "episode_closed")
        self.state = "idle"
        return self.current_episode
```

---

## Open Questions for Atlas MASTER_SPEC §3

1. **Planning LLM vs. Acting LLM** — same model for both the planning phase and per-step ReAct reasoning, or two separate models with different latency/cost profiles?
2. **Timeout budgets per state** — what are the SLA timers? (e.g., `thinking` max = 5 s, `awaiting` max = 30 s, `error` retry cap = 3 attempts)
3. **Error classification** — which errors trigger replan vs. hard `error` vs. `killed`? Does Sentinel define the error taxonomy, or is it Pulse's responsibility?
4. **Trace retention** — who owns how long traces are kept? Sentinel (audit)? Prism (UI)? Both?
5. **Multi-agent episodes** — when Pulse spawns sub-agents, does the same loop template apply recursively to each sub-agent?
