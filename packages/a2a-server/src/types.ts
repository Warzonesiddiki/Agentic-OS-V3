/**
 * types.ts — Google Gemini CLI Agent-to-Agent (A2A) Protocol Types
 */

export interface AgentProvider {
  organization: string;
  url: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  provider: AgentProvider;
  protocolVersion: string;
  version: string;
  capabilities: AgentCapabilities;
  securitySchemes: Record<string, SecurityScheme>;
  security: Array<Record<string, string[]>>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  supportsAuthenticatedExtendedCard: boolean;
}

export type A2ATaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface A2ATaskStep {
  iteration: number;
  thought: string;
  tool: string;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  goal: string;
  input?: Record<string, unknown>;
  actor: string;
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
  steps: A2ATaskStep[];
  logs: string[];
}

export interface A2ATaskPayload {
  taskId?: string;
  contextId?: string;
  goal: string;
  input?: Record<string, unknown>;
  actor?: string;
  signature?: string;
}

export interface A2AAgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  status: 'active' | 'busy' | 'offline';
}

export interface A2ATaskEvent {
  type: 'task.started' | 'task.step' | 'task.log' | 'task.completed' | 'task.failed';
  taskId: string;
  timestamp: number;
  data: unknown;
}

export interface A2AClientOptions {
  bearerToken?: string;
  signatureSecret?: string;
  timeoutMs?: number;
}
