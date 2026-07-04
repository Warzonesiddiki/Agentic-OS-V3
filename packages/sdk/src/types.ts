/**
 * Core type definitions for Agentic OS SDK
 */

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type ContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string }
  | { type: 'tool_result'; content: string; is_error: boolean };

export interface ToolCall {
  id: string;
  function: ToolFunction;
  index?: number;
}

export interface ToolFunction {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Session {
  id: string;
  provider: string;
  model: string;
  messages: Message[];
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface HealthStatus {
  status: string;
  version?: string;
  uptime?: number;
  [key: string]: unknown;
}

export interface ProviderConfig {
  kind: string;
  api_key: string;
  base_url?: string;
  default_model: string;
  rate_limit?: number;
  timeout_ms?: number;
}
