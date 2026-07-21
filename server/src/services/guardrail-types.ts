export interface GuardrailContext {
  sessionId: string;
  agentId?: string;
  actor?: string;
}

export type GuardrailType = 'input' | 'output' | 'tool';
export type ViolationAction = 'block' | 'warn' | 'modify' | 'log';
export type GuardrailStage = 'pre_tool' | 'post_tool';

export interface ViolationResult {
  passed: boolean;
  score: number;
  details: string[];
  action: ViolationAction;
  modifiedText?: string;
}

export interface GuardrailDefinition {
  name: string;
  type: GuardrailType;
  enabled: boolean;
  action: ViolationAction;
  validate: (input: GuardrailInput) => ViolationResult | Promise<ViolationResult>;
  onViolation?: (result: ViolationResult, input: GuardrailInput) => void | Promise<void>;
}

export interface GuardrailInput {
  text: string;
  type?: GuardrailType;
  sessionId: string;
  agentId?: string;
  actor?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOutput?: unknown;
}

export interface GuardrailConfig {
  allowList: string[];
  blockList: string[];
  piiRedaction: boolean;
  maxInputLength: number;
  maxOutputLength: number;
  toxicityThreshold: number;
  logViolations: boolean;
}

export interface ContentFilterResult {
  matched: boolean;
  /** True when at least one matching rule has a blocking action. */
  blocked: boolean;
  pattern: string;
  matches: string[];
  redacted: string;
}

export interface PIIResult {
  hasPII: boolean;
  entities: Array<{ type: string; value: string; start: number; end: number }>;
  redacted: string;
}

export interface GuardrailReport {
  totalChecks: number;
  violations: number;
  blocked: number;
  warned: number;
  modified: number;
  loggedOnly: number;
  byGuardrail: Record<string, { checked: number; violations: number }>;
}

export interface PatternRule {
  name: string;
  pattern: RegExp;
  severity: number;
  action: ViolationAction;
}
