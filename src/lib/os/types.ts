/**
 * os/types.ts — Agentic OS domain models.
 * Typed memory graph, agents, tasks, sagas, approvals, message bus,
 * virtual filesystem, context snapshots, handoffs, diagnostics.
 */

export type Ring = 0 | 1 | 2 | 3 | 4;

export const RING_NAMES: Record<Ring, string> = {
  0: 'kernel',
  1: 'trusted-cli',
  2: 'mcp-agent',
  3: 'remote-client',
  4: 'quarantined',
};

export type ToolProvider = 'mcp' | 'cli' | 'http' | 'builtin';
export type RiskLevel = 'safe' | 'read' | 'write' | 'destructive' | 'network' | 'privileged';

export interface ToolSpec {
  name: string;
  description: string;
  provider: ToolProvider;
  scopesRequired: string[];
  riskLevel: RiskLevel;
  minRing: Ring;
  timeoutMs: number;
  retryable: boolean;
  approvalRequired: boolean;
  authRequired?: boolean;
}

/* Typed memory graph */

export type MemoryType =
  | 'user_preference'
  | 'project_fact'
  | 'architecture_decision'
  | 'coding_convention'
  | 'known_pitfall'
  | 'debugging_lesson'
  | 'command_recipe'
  | 'api_contract'
  | 'dependency_note'
  | 'security_rule'
  | 'handoff'
  | 'task_state'
  | 'skill'
  | 'external_resource'
  | 'agent_state';

export const MEMORY_TYPES: MemoryType[] = [
  'user_preference',
  'project_fact',
  'architecture_decision',
  'coding_convention',
  'known_pitfall',
  'debugging_lesson',
  'command_recipe',
  'api_contract',
  'dependency_note',
  'security_rule',
  'handoff',
  'task_state',
  'skill',
  'external_resource',
  'agent_state',
];

export type Stability = 'draft' | 'confirmed' | 'deprecated' | 'contradicted';

export interface Evidence {
  source: 'user' | 'tool' | 'test' | 'commit' | 'file' | 'agent';
  quote?: string;
  file?: string;
  command?: string;
  exitCode?: number;
  timestamp: number;
}

export interface MemoryCard {
  id: string;
  type: MemoryType;
  title: string;
  summary: string;
  body: string;
  entities: string[];
  evidence: Evidence[];
  confidence: number; // 0..1
  stability: Stability;
  importance: number; // 0..1
  accessCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: number | null;
  lastVerifiedAt: number | null;
  decayHalfLifeDays: number;
  createdAt: number;
  updatedAt: number;
}

export type EdgeKind =
  | 'depends_on'
  | 'contradicts'
  | 'supersedes'
  | 'supports'
  | 'related_to'
  | 'caused_by'
  | 'fixed_by'
  | 'uses_skill';

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  createdAt: number;
}

/* Agents */

export type AgentKind =
  'claude-code' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'cline' | 'generic' | 'interactive';
export type AgentStatus = 'active' | 'idle' | 'paused' | 'quarantined' | 'disabled' | 'terminating';

export interface AgentResources {
  cpu: number;
  memory: number;
  openFiles: number;
  networkConnections: number;
}

export interface AgentRecord {
  id: string;
  name: string;
  kind: AgentKind;
  ring: Ring;
  scopes: string[];
  status: AgentStatus;
  cwd?: string;
  sessionId?: string;
  capabilities?: string[];
  tag?: string[];
  tools?: string[];
  systemPrompt?: string;
  memory?: string[];
  skills?: string[];
  rules?: string[];
  description?: string;
  environment?: Record<string, string>;
  dependencies?: string[];
  version?: string;
  lifecycles?: import('./agent-manifest').AgentLifecycle[];
  metadata: Record<string, string>;
  lastHeartbeatAt: number | null;
  heartbeat?: number;
  taskCount?: number;
  errorCount?: number;
  lastError?: string | null;
  quarantineUntil?: number | null;
  resources?: AgentResources;
  createdAt: number;
}

/* Scheduler / tasks */

export type QueueId = 'Q0' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'default';
export type TaskKind = 'interactive' | 'background' | 'maintenance' | 'safety' | 'self_improvement';
export type TaskStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead_letter';

export interface Task {
  id: string;
  label: string;
  kind: TaskKind;
  queue: QueueId;
  priority: number;
  status: TaskStatus;
  agentId: string;
  input: unknown;
  output?: unknown;
  error?: string;
  fuelBudget: number;
  fuelUsed: number;
  timeoutMs: number;
  idempotencyKey?: string;
  waits: number; // starvation counter
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

/* Saga */

export type SagaStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'compensated';
export interface SagaStep {
  id: string;
  name: string;
  action: string;
  compensate?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'compensated';
  result?: string;
}
export interface Saga {
  id: string;
  name: string;
  steps: SagaStep[];
  status: SagaStatus;
  currentStep: number;
  createdAt: number;
  finishedAt?: number;
}

/* Approvals */

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';
export interface Approval {
  id: string;
  agentId: string;
  action: string;
  riskLevel: RiskLevel;
  summary: string;
  details: unknown;
  status: ApprovalStatus;
  expiresAt: number;
  createdAt: number;
  resolvedAt?: number;
}

/* Message bus */

export type MessageKind = 'event' | 'command' | 'query' | 'response';

export interface BusMessage {
  id: string;
  type: string;
  kind: MessageKind;
  from: string;
  to?: string;
  topic: string;
  payload: unknown;
  correlationId?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  ttl?: number;
  priority: number;
  acked: boolean;
  deliveries: number;
  error?: string;
  createdAt: number;
}

export interface BusSubscription {
  id: string;
  subscriberId: string;
  topicPattern: string;
  filter?: (msg: BusMessage) => boolean;
  queue?: string;
  createdAt: number;
}

export interface BusDeadLetterEntry {
  message: BusMessage;
  reason: string;
  failedDeliveries: number;
  lastError: string;
  movedAt: number;
}

export interface RpcRequest {
  method: string;
  params: unknown;
  timeoutMs: number;
}

export interface RpcResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/* VFS */

export interface VfsFile {
  type: 'file';
  name: string;
  content: string;
  mtime: number;
  sensitive: boolean;
}
export interface VfsDir {
  type: 'dir';
  name: string;
  children: Record<string, VfsNode>;
}
export type VfsNode = VfsFile | VfsDir;
export interface VfsSnapshot {
  id: string;
  root: string;
  paths: string[];
  data: Record<string, string>;
  createdAt: number;
}

/* Context snapshots */

export interface ContextSnapshot {
  id: string;
  agentId: string;
  taskId?: string;
  cwd: string;
  activeMemories: string[];
  activeSkills: string[];
  activeHandoff?: string;
  recentCommands: CommandObservation[];
  compactSummary: string;
  tokenFootprint: number;
  createdAt: number;
}

/* Observations */

export interface CommandObservation {
  id: string;
  command: string;
  cwd?: string;
  exitCode: number;
  stdoutSummary: string;
  stderrSummary: string;
  filesChanged: string[];
  testsRun: number;
  result: 'success' | 'failure';
  lesson?: string;
  createdAt: number;
}

/* Handoffs */

export interface Handoff {
  id: string;
  agentFrom: string;
  goal: string;
  status: string;
  completedWork: string[];
  filesChanged: string[];
  knownFailures: string[];
  nextBestStep: string;
  importantContext: string;
  commands: { recommended: string[]; avoid: string[] };
  openQuestions: string[];
  createdAt: number;
}

/* Sessions */

export interface SessionRecord {
  id: string;
  agentId: string;
  agentKind: AgentKind;
  cwd?: string;
  startedAt: number;
  endedAt?: number;
  handoffId?: string;
  events: number;
  scopes?: string[];
  expiresAt?: number;
}

/* Diagnostics */

export type CheckLevel = 'ok' | 'warn' | 'broken';
export interface DoctorCheck {
  id: string;
  name: string;
  level: CheckLevel;
  detail: string;
}
export interface DriftResult {
  area: string;
  severity: 'info' | 'warn' | 'critical';
  expected: string;
  actual: string;
  recommendation: string;
}
export interface EvalCase {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}
export interface EvalResult {
  cases: EvalCase[];
  metrics: Record<string, number>;
  ranAt: number;
}
export interface DreamRun {
  id: string;
  mergedDuplicates: number;
  promotedPreferences: number;
  contradicted: number;
  decayed: number;
  consolidatedSessions: number;
  digest: string[];
  createdAt: number;
}
export interface ConnectorResult {
  agent: string;
  files: { path: string; content: string }[];
}

/* Metrics */

export interface Metrics {
  syscallCount: number;
  toolInvocations: number;
  policyDenials: number;
  approvalCount: number;
  recallLatencyMs: number;
  taskSucceeded: number;
  taskFailed: number;
  sagaFailures: number;
  auditAppendFailures: number;
}

/* LLM Scheduler types (Phase 4c) */

export type SchedulerPriority = 'interactive' | 'background' | 'maintenance';
export type TaskCategory =
  | 'chat'
  | 'reasoning'
  | 'extraction'
  | 'embedding'
  | 'vision'
  | 'code'
  | 'distillation'
  | 'tool_call';

export interface RateLimitConfig {
  rpm: number;
  tpm: number;
  concurrency: number;
  priority: SchedulerPriority;
}

export interface ModelRoute {
  category: TaskCategory;
  model: string;
  maxTokens: number;
  temperature: number;
  costPer1kPrompt: number;
  costPer1kCompletion: number;
}

export interface TokenBudget {
  userId: string;
  budget: number;
  used: number;
  resetAt: number;
}

export interface CostRecord {
  requestId: string;
  userId: string;
  agentId: string;
  model: string;
  category: TaskCategory;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  timestamp: number;
}

export interface SchedulerMetrics {
  queueDepth: number;
  running: number;
  processed: number;
  failed: number;
  timedOut: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokensProcessed: number;
  totalCost: number;
  byPriority: Record<SchedulerPriority, { queued: number; running: number }>;
}

export interface ScheduledRequest {
  id: string;
  userId: string;
  agentId: string;
  category: TaskCategory;
  priority: SchedulerPriority;
  model: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  timeoutMs: number;
  result?: unknown;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  traceId?: string;
}

export interface OSState {
  agents: AgentRecord[];
  cards: MemoryCard[];
  edges: GraphEdge[];
  tasks: Task[];
  sagas: Saga[];
  approvals: Approval[];
  bus: BusMessage[];
  subscriptions: BusSubscription[];
  deadLetterBus: BusDeadLetterEntry[];
  vfs: VfsDir;
  vfsSnapshots: VfsSnapshot[];
  snapshots: ContextSnapshot[];
  handoffs: Handoff[];
  sessions: SessionRecord[];
  observations: CommandObservation[];
  dreamLog: DreamRun[];
  connectors: string[];
  metrics: Metrics;
  meta: Record<string, string>;
  // Phase 3.3: MCP Server Registry
  mcpServers?: MCPServerState[];
  // Phase 5: live kernel scheduler policy (mirrors the real backend when remote)
  scheduler: { policy: string };
}

// ── Phase 3.3: MCP Server Registry Types ────────────────────────────

export type MCPTransport = 'stdio' | 'http-sse' | 'streamable-http';

export interface MCPServerState {
  id: string;
  name: string;
  transport: MCPTransport;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  toolCount: number;
  error?: string;
  lastConnected?: number;
  createdAt: number;
}

export interface MCPDiscoveredTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  serverId: string;
  serverName: string;
  transport: MCPTransport;
}

export interface MCPPolicyEntry {
  serverPattern?: string;
  toolPattern?: string;
  minRing?: Ring;
  rateLimit?: number;
  allowed: boolean;
}

export interface MCPPolicyConfig {
  defaultPolicy: 'allow' | 'deny';
  overrides: MCPPolicyEntry[];
}
