# NEXUS 2.0 Kernel Design Proposal
**Author:** Forge (Kernel Engineer)
**Date:** 2026-06-29
**Status:** Draft — pending reconciliation with Atlas MASTER_SPEC.md

---

## 1. Process/Supervisor Model

**Recommendation: Actor Model + Supervisor Tree (hybrid)**

Agents are **actors**: each has an isolated mailbox, own state, and communicates purely via messages. A supervision tree handles fault recovery.

```
trait Actor {
    async fn receive(&mut self, msg: Envelope) -> Option<Vec<Envelope>>;
    fn id(&self) -> AgentId;
}

trait Supervisor {
    fn decide_restart(&self, child: AgentId, error: &Error) -> RestartPolicy;
    fn add_child(&mut self, id: AgentId, policy: RestartPolicy);
    fn remove_child(&mut self, id: AgentId);
}
```

**Topology:**
- Root supervisor (kernel-level) → Team supervisors → Agent leafs
- Each team has a supervisor; agents are children of their team supervisor
- Flat pool used **only** for stateless, side-effect-free batch tasks

**Why not flat pool?** No fault isolation — one crash kills the pool. Tree gives bounded blast radius.

**Why not pure actor (no supervisor)?** We'd lose automated recovery. The supervisor tree is the fault-tolerance backbone.

---

## 2. Message Bus

**Recommendation: NATS-like distributed log with in-process zero-copy fallback**

```
trait MessageBus {
    /// Publish to a subject. Returns sequence number.
    async fn publish(&self, subject: &str, payload: &[u8]) -> Result<u64, BusError>;
    
    /// Subscribe to a subject. Returns stream of deliveries.
    async fn subscribe(&self, subject: &str) -> Result<impl Stream<Item = Delivery>, BusError>;
    
    /// Acknowledge a delivery (enables at-least-once).
    async fn ack(&self, delivery: &Delivery) -> Result<(), BusError>;
    
    /// Flush pending publishes.
    async fn flush(&self) -> Result<(), BusError>;
}
```

**Why NATS-like (JetStream)?**
- At-least-once delivery out of the box (ack-based)
- Subject-based routing maps naturally to teams/ag agents
- Consumer credits provide backpressure without app-level code
- Persistent streams survive broker restarts
- Scales to cross-host communication for distributed NEXUS deployments

**In-process fallback:** Zero-copy ring buffer (same interface). Enables single-process NEXUS for dev/test without network dependency. Swap implementations without changing callers.

**Why not Redis Streams?** Redis is a general-purpose store. We'd fight it for priority/ordering semantics. NATS is designed for message routing with built-in flow control.

**Why not raw in-process queue?** Doesn't survive process crashes and can't cross host boundaries.

---

## 3. IPC Primitive

**Recommendation: Async messages (primary) + shared memory (opt-in for bulk data)**

```
// --- Primary: message passing ---
async fn send(dst: AgentId, msg: Envelope) -> Result<(), BusError>;
async fn request(dst: AgentId, msg: Envelope, timeout: Duration) -> Result<Envelope, BusError>;

// --- Opt-in: shared memory for large binary payloads ---
async fn allocate_shm(size: usize) -> Result<ShmId, ShmError>;
async fn share_shm(src: AgentId, shm: ShmId, dst: AgentId) -> Result<(), CapError>;
async fn revoke_shm(shm: ShmId) -> Result<(), ShmError>;

// --- Envelope type ---
struct Envelope {
    src: AgentId,
    dst: AgentId,
    subject: String,
    payload: Vec<u8>,
    reply_to: Option<u64>,   // correlation ID for request/reply
    ttl_ms: u64,
}
```

**Rationale:** 
- 90% of IPC is small control messages (spawn, kill, config, routing) — async messages are ideal
- 10% is bulk data (model weights, images, large artifacts) — shared memory avoids serialization overhead
- Shared memory requires **explicit capability grant** — agents cannot silently share memory

**Tradeoff:** Shared memory adds complexity (capability grants, reference counting). Accept it only for payloads > 1MB.

---

## 4. Scheduler

**Recommendation: Priority bands + Deficit Round Robin (DRR) + work-stealing**

```
trait Scheduler {
    fn enqueue(&self, task: Task, priority: Priority) -> Result<(), SchedError>;
    async fn run_until_idle(&self) -> usize;  // returns tasks processed
    fn queue_depth(&self, priority: Priority) -> usize;
}

// Priority bands (P0 = highest):
enum Priority {
    P0_Kernel,    // heartbeats, health checks — never evictable
    P1_Control,   // spawn, kill, config — admin control plane
    P2_Agent,      // business logic — agent tasks
    P3_Background, // logs, metrics, cleanup — first to evict
}
```

**How it works:**
1. Tasks enter priority band queue
2. Within each band: DRR ensures fair time-slicing across agents
3. Work-stealing: idle worker threads steal from non-empty queues in the same band to prevent head-of-line blocking
4. On memory pressure: P3 evicted first, then P2, then P1 (P0 never evicted)

**Why priority bands first?** Pure work-stealing suffers priority inversion — P0 tasks get buried if P2 floods in. Bands + steal-within-band solves this.

**Why DRR within bands?** Prevents a single chatty agent from monopolizing a priority band.

---

## 5. Sandbox Primitive

**Recommendation: Wasm (primary) + Linux containers (optional for legacy)**

```
trait Sandbox {
    async fn spawn(&self, module: &WasmModule, caps: Capabilities) -> Result<AgentId, SandboxError>;
    async fn terminate(&self, id: AgentId) -> Result<(), SandboxError>;
    fn get_usage(&self, id: AgentId) -> ResourceUsage;
    fn set_caps(&self, id: AgentId, caps: Capabilities) -> Result<(), SandboxError>;
}

struct Capabilities {
    max_memory_mb: u64,
    max_cpu_percent: u64,
    max_tasks: usize,
    allowed_syscalls: HashSet<Syscall>,
    allowed_network: bool,
}
```

**Isolation guarantees:**
- **Wasm agents:** Cannot escape sandbox without explicit capability grants. All syscalls mediated by runtime (Wasmtime). Deterministic resource caps enforced by bytecode analysis + metering.
- **Container agents:** seccomp + cgroups + namespaces. gVisor adds syscall filtering. Used only for agents needing full OS (legacy Python, shell execution).

**Why Wasm-first?**
- Near-native speed with deterministic resource metering
- Portable across host OS/arch
- Capabilities can be revoked at runtime
- No cgroup namespace bookkeeping

**Tradeoff:** Wasm has limited syscall coverage. Agents needing POSIX compatibility (shell, Python REPL) fall back to containers with gVisor overhead.

---

## 6. Failure Model

### Crash Detection
- Supervisor sends heartbeat to each child every **5 seconds**
- **3 missed heartbeats** → child declared dead
- Heartbeats are P0 (kernel critical) — never dropped

### Restart Policy
```
enum RestartPolicy {
    OneForOne,      // restart dead child only
    OneForAll,      // restart all siblings
    RestForOne,     // restart dead + its dependent chain
}
```
**Default: OneForOne with exponential backoff** (max 5 restarts, 30s cap).

### Message Loss Handling
```
// In-flight messages to dead agent:
1. Bus NAKs delivery → message returned to sender or routed to DLQ
2. Sender notified via error variant on send()
3. DLQ (dead letter queue) holds non-idempotent messages for manual inspection
```

**At-least-once delivery guarantees no silent drops.** Consumer credits enforce backpressure — slow consumers don't buffer indefinitely.

### Backpressure
- Slow consumer → bus reduces credit allocation → publisher naturally throttles
- Memory pressure → scheduler evicts P3 tasks first, then P2, then P1
- Full memory → OOM killer targets P3 agents first

---

## 7. Interface Contracts

### 7.1 Agent Lifecycle
```rust
// Spawn a new agent in a sandbox
async fn agent_spawn(
    team: TeamId,
    wasm_module: &[u8],
    caps: Capabilities,
) -> Result<AgentId, KernelError>;

// Terminate an agent immediately
async fn agent_terminate(agent: AgentId) -> Result<(), KernelError>;

// Check agent health
async fn agent_health(agent: AgentId) -> HealthStatus;
```

### 7.2 Message Bus
```rust
// Publish a message to a subject
async fn bus_publish(subject: &str, payload: &[u8]) -> Result<u64, BusError>;

// Subscribe to a subject
async fn bus_subscribe(subject: &str) -> Result<impl Stream<Item = Delivery>, BusError>;

// Acknowledge delivery (enables at-least-once)
async fn bus_ack(delivery: &Delivery) -> Result<(), BusError>;
```

### 7.3 IPC (Agent-to-Agent)
```rust
// Fire-and-forget send
async fn ipc_send(dst: AgentId, msg: Envelope) -> Result<(), BusError>;

// Request/reply with timeout
async fn ipc_request(
    dst: AgentId,
    msg: Envelope,
    timeout: Duration,
) -> Result<Envelope, BusError>;
```

### 7.4 Shared Memory
```rust
// Allocate a shared memory region
async fn shm_allocate(size: usize) -> Result<ShmId, ShmError>;

// Grant read access to another agent
async fn shm_share(shm: ShmId, dst: AgentId, perms: ShmPerms) -> Result<(), CapError>;

// Revoke all access and free
async fn shm_revoke(shm: ShmId) -> Result<(), ShmError>;
```

### 7.5 Resource Caps
```rust
// Get current resource usage for an agent
fn agent_usage(agent: AgentId) -> ResourceUsage;

// Adjust capabilities at runtime
async fn agent_set_caps(agent: AgentId, caps: Capabilities) -> Result<(), KernelError>;
```

---

## Tech Stack Pick

**Rust** for the kernel core.

Rationale: Memory safety without GC (predictable latency), ownership model catches data race bugs at compile time, excellent async runtime support (Tokio), and Wasm compilation target built-in. This is a hard real-time system — garbage collection pauses are unacceptable.

---

## Open Questions

1. **Subject naming convention:** Should subjects be hierarchical (`team.agent.action`) or flat (`agent:action`)? Affects subscription granularity and routing performance.

2. **Wasm vs container boundary:** Which agent types get Wasm vs container sandbox? Need a policy table (e.g., "Python/shell = container, Rust/JS = Wasm").

3. **Shared memory lifecycle:** If an agent holding a shared memory reference crashes before revoking, does the kernel reclaim the memory immediately or wait for explicit GC? Implicit reclamation risks use-after-free; explicit waits risks leaks.
