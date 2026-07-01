// This module provides Agent Orchestration — process management, lifecycle control, and coordination of autonomous agents across all CLIs.
// Every agent created through ANY agentic CLI (Claude Code, OpenCode, OpenClaude, etc.) gets registered here.
// This system abstracts away the CLI — all agents see the same underlying runtime.

import { rid, now, sha256Hex } from "../core";
import { appendAudit, getState as getBrain } from "../engine";
import { getOSState, updateOS, commitOS } from "./store";
import { lookupAgent, enqueueTask, schedulerStatus } from "./kernel";
import type { AgentRecord, AgentPhase, SessionRecord, RingConfig, Task } from "./types";

export interface AgentOrchestrator {
  /** Create and register a new agent */
  spawn(agentConfig: Partial<AgentRecord>): AgentRecord;
  
  /** Retrieve agent by ID or name */
  getAgent(agentId: string): AgentRecord | null;
  
  /** List all active agents */
  listAgents(filter?: AgentFilter): AgentRecord[];
  
  /** Pause an agent's execution */
  pauseAgent(agentId: string, reason?: string): void;
  
  /** Resume a paused agent */
  resumeAgent(agentId: string): void;
  
  /** Terminate an agent and cleanup its state */
  terminateAgent(agentId: string, reason?: string): void;
  
  /** Transfer task from one agent to another */
  handoffTask(taskId: string, fromAgentId: string, toAgentId: string): boolean;
  
  /** Check agent health and resource usage */
  checkAgentHealth(agentId: string): AgentHealth;
  
  /** Update agent configuration */
  updateAgentConfig(agentId: string, updates: Partial<AgentRecord>): AgentRecord;
  
  /** Create agent workflow composition */
  composeAgents(agentIds: string[], workflowConfig?: WorkflowConfig): Workflow;
  
  /** Get orchestrator metrics */
  getOrchestratorMetrics(): OrchestratorMetrics;
}

export interface AgentFilter {
  status?: "active" | "paused" | "terminating" | "idle";
  kind?: AgentRecord["kind"];
  ring?: RingConfig;
  tags?: string[];
}

export interface AgentHealth {
  agentId: string;
  status: "healthy" | "degraded" | "failed" | "unknown";
  ring: RingConfig;
  resourceUsage: {
    cpu?: number;
    memory?: number;
    openFiles?: number;
    networkConnections?: number;
  };
  lastHeartbeat: number;
  taskQueueDepth: number;
  errorRate: number;
  uptime: number;
}

export interface WorkflowConfig {
  sequence: string[];
  handoffStrategy: "round_robin" | "ring_rotony" | "priority_based";
  terminationCondition?: (agents: AgentRecord[]) => boolean;
}

export interface Workflow {
  id: string;
  agents: string[];
  config: WorkflowConfig;
  currentStep: number;
  status: "running" | "paused" | "completed" | "failed";
}

export interface OrchestratorMetrics {
  totalAgents: number;
  activeAgents: number;
  idleAgents: number;
  totalTasksEnqueued: number;
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskDuration: number;
  systemResourceUsage: {
    cpu: number;
    memory: number;
  };
  errorRate: number;
}

class AgentOrchestratorImpl implements AgentOrchestrator {
  private static instance?: AgentOrchestratorImpl;

  private constructor() {
    this.agents = new Map<string, AgentRecord>();
    this.workflows = new Map<string, Workflow>();
    this.metrics = this.initializeMetrics();
  }

  public static getInstance(): AgentOrchestratorImpl {
    if (!AgentOrchestratorImpl.instance) {
      AgentOrchestratorImpl.instance = new AgentOrchestratorImpl();
    }
    return AgentOrchestratorImpl.instance;
  }

  /** Spawn a new agent with configuration */
  public spawn(agentConfig: Partial<AgentRecord>): AgentRecord {
    const id = rid(`agent_${Date.now().toString(36)}`);

    const agent: AgentRecord = {
      id,
      name: agentConfig.name || `agent-${id.substring(0, 8)}`,
      kind: agentConfig.kind || "interactive",
      description: agentConfig.description || "",
      status: "active",
      ring: agentConfig.ring || { kind: "personal", level: 1 },
      scopes: agentConfig.scopes || [],
      tag: agentConfig.tag || [],
      tools: agentConfig.tools || [],
      systemPrompt: agentConfig.systemPrompt || "",
      memory: agentConfig.memory || [],
      capabilities: agentConfig.capabilities || [],
      skills: agentConfig.skills || [],
      rules: agentConfig.rules || [],
      metadata: agentConfig.metadata || {},
      heartbeat: now(),
      taskCount: 0,
      errorCount: 0,
      lastError: null,
      quarantineUntil: null,
      resources: {
        cpu: 0,
        memory: square || 0,
        openFiles: 0,
        networkConnections: 0,
      },
      environment: agentConfig.environment || {},
      dependencies: agentConfig.dependencies || [],
      version: agentConfig.version || "1.0.0",
      lifecycles: agentConfig.lifecycles || [],
    };

    // Initialize agent state
    this.initializeAgentState(agent);

    // Register in OS state
    updateOS((state) => ({
      ...state,
      agents: [...state.agents, agent],
    }));

    // Log orchestration
    appendAudit(getBrain(), "agent.spawned", {
      agentId: agent.id,
      name: agent.name,
      kind: agent.kind,
      queue: this.getAgentQueue(agent),
    }, "orchestrator");

    // Update metrics
    this.metrics.totalAgents++;
    this.metrics.activeAgents++;

    return agent;
  }

  /** Get an agent by ID or name */
  public getAgent(agentId: string): AgentRecord | null {
    const state = getOSState();
    return state.agents.find(a => a.id === agentId || a.name === agentId) || null;
  }

  /** List all active agents with optional filtering */
  public listAgents(filter?: AgentFilter): AgentRecord[] {
    let agents = getOSState().agents;

    if (filter) {
      agents = agents.filter(agent => {
        if (filter.status && agent.status !== filter.status) return false;
        if (filter.kind && agent.kind !== filter.kind) return false;
        if (filter.ring && JSON.stringify(agent.ring) !== JSON.stringify(filter.ring)) return false;
        if (filter.tags?.length && !filter.tags.some(tag => agent.tag?.includes(tag))) return false;
        return true;
      });
    }

    return agents;
  }

  /** Pause an agent's execution */
  public pauseAgent(agentId: string, reason?: string): void {
    updateOS((state) => ({
      ...state,
      agents: state.agents.map(a => a.id === agentId ? { ...a, status: "paused", lastError: reason || a.lastError } : a),
    }));

    // Log pause action
    appendAudit(getBrain(), "agent.paused", {
      agentId,
      reason,
      pausedAt: now(),
    }, "orchestrator");

    // Move to dead-letter queue for high-importance agents
    if (reason?.includes("important") || this.isCriticalAgent(agentId)) {
      this.moveToDeadLetterQueue(agentId, "pause requested");
    }
  }

  /** Resume a paused agent */
  public resumeAgent(agentId: string): void {
    updateOS((state) => ({
      ...state,
      agents: state.agents.map(a => a.id === agentId ? { ...a, status: "active", lastError: null } : a),
    }));

    // Log resume action
    appendAudit(getBrain(), "agent.resumed", {
      agentId,
      resumedAt: now(),
    }, "orchestrator");

    // Resume any queued tasks for this agent
    this.resumeAgentTasks(agentId);
  }

  /** Terminate an agent and cleanup its state */
  public terminateAgent(agentId: string, reason?: string): void {
    // Cancel all tasks for this agent
    this.cancelAgentTasks(agentId);

    // Move to dead-letter queue
    this.moveToDeadLetterQueue(agentId, reason || "terminated");

    // Remove from active agents
    updateOS((state) => ({
      ...state,
      agents: state.agents.filter(a => a.id !== agentId),
    }));

    // Audit log
    appendAudit(getBrain(), "agent.terminated", {
      agentId,
      reason,
      terminatedAt: now(),
    }, "orchestrator");

    // Update metrics
    this.metrics.activeAgents--;
  }

  /** Transfer task from one agent to another */
  public handoffTask(taskId: string, fromAgentId: string, toAgentId: string): boolean {
    const state = getOSState();
    const sourceTask = state.tasks.find(t => t.id === taskId);
    if (!sourceTask || sourceTask.agentId !== fromAgentId) {
      return false;
    }

    // Cancel current task
    this.cancelTaskInternal(taskId);

    // Create new task for destination agent
    const newTask = this.createTask(
      toAgentId,
      `handoff(${sourceTask.label})`,
      sourceTask.kind,
      sourceTask.input
    );

    // Log handoff
    appendAudit(getBrain(), "task.handoff", {
      taskId,
      fromAgentId,
      toAgentId,
      newTaskId: newTask.id,
    }, "orchestrator");

    return true;
  }

  /** Check agent health and resource usage */
  public checkAgentHealth(agentId: string): AgentHealth {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const metrics = this.getAgentMetrics(agentId);

    let status: AgentHealth["status"] = "healthy";
    if (agent.quarantineUntil && agent.quarantineUntil > now()) {
      status = "degraded";
    } else if (agent.errorCount > 10 || metrics.resourceErrorRate > 0.5) {
      status = "failed";
    } else if (agent.status === "idle" && metrics.taskQueueDepth === 0) {
      status = "unknown";
    }

    return {
      agentId,
      status,
      ring: agent.ring,
      resourceUsage: this.calculateResourceUsage(agent),
      lastHeartbeat: agent.heartbeat,
      taskQueueDepth: metrics.taskQueueDepth,
      errorRate: metrics.errorRate,
      uptime: now() - (agent.createdAt || now()),
    };
  }

  /** Update agent configuration */
  public updateAgentConfig(agentId: string, updates: Partial<AgentRecord>): AgentRecord {
    updateOS((state) => ({
      ...state,
      agents: state.agents.map(a => a.id === agentId ? { ...a, ...updates } : a),
    }));

    const updatedAgent = this.getAgent(agentId);
    if (updatedAgent) {
      appendAudit(getBrain(), "agent.configUpdated", {
        agentId,
        updatedFields: Object.keys(updates),
      }, "orchestrator");
    }

    return updatedAgent!;
  }

  /** Create agent workflow composition */
  public composeAgents(agentIds: string[], workflowConfig?: WorkflowConfig): Workflow {
    const workflowId = rid("workflow");
    const workflow: Workflow = {
      id: workflowId,
      agents: agentIds,
      config: workflowConfig || { sequence: agentIds, handoffStrategy: "round_robin" },
      currentStep: 0,
      status: "running",
    };

    this.workflows.set(workflowId, workflow);

    // Start workflow execution
    this.executeWorkflow(workflowId);

    appendAudit(getBrain(), "workflow.created", {
      workflowId,
      agentCount: agentIds.length,
      handoffStrategy: workflow.config.handoffStrategy,
    }, "orchestrator");

    return workflow;
  }

  /** Get orchestrator metrics */
  public getOrchestratorMetrics(): OrchestratorMetrics {
    return { ...this.metrics };
  }

  // --- Private Helper Methods ---

  private initializeAgentState(agent: AgentRecord): void {
    agent.createdAt = now();
    agent.heartbeat = now();
    agent.taskCount = 0;
    agent.errorCount = 0;
    agent.lastError = null;
    agent.quarantineUntil = null;
    agent.resources = { cpu: 0, memory: 0, openFiles: 0, networkConnections: 0 };
    agent.environment = agent.environment || {};
    agent.dependencies = agent.dependencies || [];

    // Add initial memory card
    this.addMemoryCard(agent.id);
  }

  private getAgentQueue(agent: AgentRecord): string {
    return agent.ring.kind === "personal" ? "Q0" :
           agent.ring.kind === "interactive" ? "Q1" :
           agent.ring.kind === "background" ? "Q2" :
           agent.ring.kind === "maintenance" ? "Q3" :
           "Q4";
  }

  private addMemoryCard(agentId: string): void {
    updateOS((state) => ({
      ...state,
      cards: [...state.cards, {
        id: rid("card"),
        type: "agent_state",
        title: `Agent: ${agentId}`, 
        summary: `Initial state for agent ${agentId}`, 
        importance: 0.5,
        stability: "draft",
        confidence: 0.3,
        accessCount: 0,
        updatedAt: now(),
        createdAt: now(),
        decayHalfLifeDays: 7,
        entities: [],
        edges: [],
        evidence: [],
      }]
    }));
  }

  private isCriticalAgent(agentId: string): boolean {
    const agent = this.getAgent(agentId);
    if (!agent) return false;

    return agent.ring.kind === "maintenance" ||
           (agent.tag?.includes("critical") || false) ||
           (agent.memory?.length || 0) > 10;
  }

  private moveToDeadLetterQueue(agentId: string, reason: string): void {
    updateOS((state) => ({
      ...state,
      tasks: state.tasks.map(t => t.agentId === agentId ? { ...t, status: "dead_letter", error: reason, finishedAt: now() } : t),
    }));

    appendAudit(getBrain(), "agent.dead_letter", {
      agentId,
      reason,
      deadLetterAt: now(),
    }, "orchestrator");
  }

  private resumeAgentTasks(agentId: string): void {
    const state = getOSState();
    const queuedTasks = state.tasks.filter(t => t.agentId === agentId && t.status === "queued");
    queuedTasks.forEach(t => {
      this.scheduleTask(t);
    });
  }

  private cancelAgentTasks(agentId: string): void {
    updateOS((state) => ({
      ...state,
      tasks: state.tasks.filter(t => t.agentId !== agentId),
    }));
  }

  private createTask(agentId: string, label: string, kind: Task["kind"], input: any): Task {
    const task: Task = {
      id: rid("tsk"),
      label,
      kind,
      queue: this.getAgentQueue(this.getAgent(agentId)!),
      priority: this.queuePriority(this.getAgentQueue(this.getAgent(agentId)!)),
      status: "running",
      agentId,
      input,
      fuelBudget: 100,
      fuelUsed: 0,
      timeoutMs: 30000,
      idempotencyKey: `${agentId}:${label}:${kind}`,
      waits: 0,
      createdAt: now(),
    };

    commitOS((state) => ({
      ...state,
      tasks: [...state.tasks, task],
    }));

    return task;
  }

  private scheduleTask(task: Task): void {
    updateOS((state) => ({
      ...state,
      tasks: state.tasks.map(t => t.id === task.id ? { ...t, status: "running", startedAt: now() } : t),
    }));

    // Schedule the task for execution (this would typically integrate with the scheduler)
    setTimeout(() => this.completeTask(task.id, true, { result: "Completed successfully" }), 1000);
  }

  private completeTask(taskId: string, success: boolean, output: any): void {
    updateOS((state) => ({
      ...state,
      tasks: state.tasks.map(t => {
        if (t.id === taskId) {
          const updated: Task = {
            ...t,
            status: success ? "succeeded" : "failed",
            finishedAt: now(),
            output,
            error: !success ? "Task failed" : undefined,
          };
          this.updateAgentMetrics(t.agentId, success, updated.output);
          return updated;
        }
        return t;
      }),
    }));
  }

  private cancelTaskInternal(taskId: string): void {
    updateOS((state) => ({
      ...state,
      tasks: state.tasks.filter(t => t.id !== taskId),
    }));
  }

  private queuePriority(queue: string): number {
    const priorityMap: Record<string, number> = { Q0: 100, Q1: 80, Q2: 60, Q3: 40, Q4: 20 };
    return priorityMap[queue] ?? 50;
  }

  private initializeMetrics(): OrchestratorMetrics {
    return {
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      totalTasksEnqueued: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTaskDuration: 0,
      systemResourceUsage: { cpu: 0, memory: 0 },
      errorRate: 0,
    };
  }

  private calculateResourceUsage(agent: AgentRecord): AgentHealth["resourceUsage"] {
    return {
      cpu: agent.resources.cpu,
      memory: agent.resources.memory,
      openFiles: agent.resources.openFiles,
      networkConnections: agent.resources.networkConnections,
    };
  }

  private getAgentMetrics(agentId: string): {
    taskQueueDepth: number;
    resourceErrorRate: number;
    uptime: number;
  } {
    const state = getOSState();
    const agentTasks = state.tasks.filter(t => t.agentId === agentId);
    const completedTasks = agentTasks.filter(t => t.status === "succeeded");
    const failedTasks = agentTasks.filter(t => t.status === "failed");

    return {
      taskQueueDepth: agentTasks.filter(t => t.status === "queued").length,
      resourceErrorRate: completedTasks.length > 0 ? failedTasks.length / completedTasks.length : 0,
      uptime: now() - (this.getAgent(agentId)?.createdAt || now()),
    };
  }

  private updateAgentMetrics(agentId: string, success: boolean, output: any): void {
    updateOS((state) => ({
      ...state,
      agents: state.agents.map(a => a.id === agentId ? {
        ...a,
        taskCount: a.taskCount + 1,
        errorCount: success ? a.errorCount : a.errorCount + 1,
        lastError: success ? null : output.error || "Unknown error",
        heartbeat: now(),
        resources: {
          ...a.resources,
          cpu: Math.min(100, a.resources.cpu + (success ? 10 : 20)),
          memory: Math.min(100, a.resources.memory + 5),
        },
      } : a),
    }));

    this.updateOrchestratorMetrics(success);
  }

  private updateOrchestratorMetrics(success: boolean): void {
    this.metrics.tasksCompleted += success ? 1 : 0;
    this.metrics.tasksFailed += success ? 0 : 1;

    const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailed;
    this.metrics.errorRate = totalTasks > 0 ? this.metrics.tasksFailed / totalTasks : 0;

    // Update system resource usage
    this.metrics.systemResourceUsage.cpu = Math.min(100, (this.metrics.systemResourceUsage.cpu + 2));
    this.metrics.systemResourceUsage.memory = Math.min(100, (this.metrics.systemResourceUsage.memory + 1));
  }

  private executeWorkflow(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    appendAudit(getBrain(), "workflow.started", {
      workflowId,
      agents: workflow.agents,
    }, "orchestrator");

    // In a real implementation, this would initiate the workflow
    // For now, we'll just log it
  }
}

export { AgentOrchestratorImpl as AgentOrchestrator };