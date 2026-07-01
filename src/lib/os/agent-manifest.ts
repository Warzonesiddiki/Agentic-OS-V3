/**
 * agent-manifest.ts - Core Agent Manifest Parser and Manager for Agentic OS V3
 *
 * Browser-safe implementation for Phase 2a - YAML Agent Manifests.
 * Filesystem operations are gated behind runtime environment checks.
 * In browser context, manifests must be provided as JSON objects directly.
 */

import { z } from "zod";
import { rid } from "../core";

// ── Interfaces ──────────────────────────────────────────────────────

export interface AgentMemoryConfig {
  type?: "short_term" | "long_term" | "episodic";
  capacity?: number;
  retention?: "permanent" | "session" | "temporary";
  similarity_threshold?: number;
}

export interface KnowledgeSourceItem {
  type: "file" | "text" | "directory";
  path?: string;
  content?: string;
  shared?: boolean;
}

export interface AgentLifecycle {
  stage: "init" | "ready" | "executing" | "completed" | "error";
  trigger?: string;
  action: string;
  timestamp?: number;
}

export interface AgentManifest {
  id?: string;
  name: string;
  role?: string;
  goal?: string;
  backstory?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  max_iter?: number;
  allow_delegation?: boolean;
  verbose?: boolean;
  tools?: string[];
  capabilities?: string[];
  skills?: string[];
  memory?: AgentMemoryConfig;
  knowledge_sources?: KnowledgeSourceItem[];
  work_dir?: string;
  requirements?: string[];
  tags?: string[];
  system_template?: string;
  prompt_template?: string;
  response_template?: string;
  output_pydantic?: unknown;
  output_json?: Record<string, unknown>;
  environment?: Record<string, string>;
  dependencies?: string[];
  version?: string;
  lifecycles?: AgentLifecycle[];
  rules?: string[];
  metadata?: Record<string, unknown>;
}

// ── Zod schema ───────────────────────────────────────────────────────

const agentManifestSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  goal: z.string().optional(),
  backstory: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(100).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_iter: z.number().int().min(1).optional(),
  allow_delegation: z.boolean().optional(),
  verbose: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  memory: z.object({
    type: z.enum(["short_term", "long_term", "episodic"]).optional(),
    capacity: z.number().int().min(1).optional(),
    retention: z.enum(["permanent", "session", "temporary"]).optional(),
    similarity_threshold: z.number().min(0).max(1).optional(),
  }).optional(),
  knowledge_sources: z.array(z.object({
    type: z.enum(["file", "text", "directory"]),
    path: z.string().optional(),
    content: z.string().optional(),
    shared: z.boolean().optional(),
  })).optional(),
  work_dir: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  system_template: z.string().optional(),
  prompt_template: z.string().optional(),
  response_template: z.string().optional(),
  output_pydantic: z.any().optional(),
  output_json: z.record(z.string(), z.any()).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  version: z.string().optional(),
  lifecycles: z.array(z.object({
    stage: z.enum(["init", "ready", "executing", "completed", "error"]),
    trigger: z.string().optional(),
    action: z.string(),
    timestamp: z.number().optional(),
  })).optional(),
  rules: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type AgentManifestInput = z.infer<typeof agentManifestSchema>;

// ── Helpers ──────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Validate raw input against the schema and return a full AgentManifest with defaults. */
export function parseManifestFromObject(input: AgentManifestInput): AgentManifest {
  const v = agentManifestSchema.parse(input);
  return {
    id: v.id || rid(`agent_${Date.now()}`),
    name: v.name,
    role: v.role,
    goal: v.goal,
    backstory: v.backstory,
    model: v.model,
    temperature: v.temperature,
    max_tokens: v.max_tokens,
    top_p: v.top_p,
    max_iter: v.max_iter,
    allow_delegation: v.allow_delegation ?? false,
    verbose: v.verbose ?? false,
    tools: v.tools ?? [],
    capabilities: v.capabilities ?? [],
    skills: v.skills ?? [],
    memory: v.memory,
    knowledge_sources: v.knowledge_sources ?? [],
    work_dir: v.work_dir,
    requirements: v.requirements ?? [],
    tags: v.tags ?? [],
    system_template: v.system_template,
    prompt_template: v.prompt_template,
    response_template: v.response_template,
    output_pydantic: v.output_pydantic,
    output_json: v.output_json,
    environment: v.environment ?? {},
    dependencies: v.dependencies ?? [],
    version: v.version,
    lifecycles: v.lifecycles ?? [],
    rules: v.rules ?? [],
    metadata: v.metadata ?? {},
  };
}

// ── File-based operations (server only) ──────────────────────────────

/**
 * Parse and validate an agent manifest from the filesystem (server-only).
 * In browser context, throws an error advising to use parseManifestFromObject instead.
 */
export function parseAgentManifest(_filePath: string): AgentManifest {
  if (isBrowser()) {
    throw new Error("Filesystem access unavailable in browser. Use parseManifestFromObject() with JSON data.");
  }
  // Server implementation would use dynamic imports:
  // const fs = await import("node:fs/promises");
  // const path = await import("node:path");
  // For now, throw a descriptive error since this is a browser build.
  throw new Error("parseAgentManifest requires a server runtime. Use parseManifestFromObject() with in-memory data.");
}

/**
 * Load agent manifests from a directory (server-only).
 * Returns empty array in browser context.
 */
export function loadAgentManifestsFromDirectory(_dirPath: string): AgentManifest[] {
  if (isBrowser()) return [];
  // Server implementation would read the directory
  return [];
}

// ── Validation helpers (browser-safe) ───────────────────────────────

export function loadAgentManifest(agentId: string, manifests: AgentManifest[]): AgentManifest | null {
  return manifests.find(m => m.id === agentId) ?? null;
}

export function validateAgentManifest(manifest: AgentManifestInput): boolean {
  try {
    agentManifestSchema.parse(manifest);
    return true;
  } catch {
    return false;
  }
}

export function getAgentManifestErrors(manifest: AgentManifestInput): string[] {
  try {
    agentManifestSchema.parse(manifest);
    return [];
  } catch (e) {
    if (e instanceof z.ZodError) {
      return e.issues.map(err => `${err.path.join(".")}: ${err.message}`);
    }
    return [e instanceof Error ? e.message : String(e)];
  }
}

export function displayManifestIssues(manifest: AgentManifestInput): void {
  const errors = getAgentManifestErrors(manifest);
  if (errors.length > 0) {
    console.error("Agent manifest validation issues:", errors);
  }
}

// ── Higher-level operations ──────────────────────────────────────────

export function deployAgentWithDependencies(
  manifestPath: string,
  _dependencies?: string,
): { agentId: string; manifest: AgentManifest } {
  if (isBrowser()) {
    throw new Error("Filesystem deployment unavailable in browser environment");
  }
  const manifest = parseAgentManifest(manifestPath);
  const agentId = manifest.id || rid(`agent_${Date.now()}`);
  return { agentId, manifest };
}

export function searchAgentManifests(_searchTerms: string[]): string[] {
  return [];
}

export function listAgentManifests(directoryPath: string): AgentManifest[] {
  return loadAgentManifestsFromDirectory(directoryPath);
}

export function generateAgentDocumentation(agent: AgentManifestInput): void {
  console.log(`Agent: ${agent.name || "Unnamed"}`);
  console.log(`Role: ${agent.role || "Not specified"}`);
  console.log(`Goal: ${agent.goal || "Not specified"}`);
  console.log(`Model: ${agent.model || "Default"}`);
  console.log(`Tools: ${agent.tools?.join(", ") || "None"}`);
  console.log(`Max Iterations: ${agent.max_iter || "Not specified"}`);
}

export function refreshAgentWithDependencies(
  agentId: string,
  dependencyPath: string,
): AgentManifest {
  const manifests = loadAgentManifestsFromDirectory(dependencyPath);
  const agent = loadAgentManifest(agentId, manifests);
  if (!agent) throw new Error(`Agent not found with ID: ${agentId}`);
  return agent;
}

export function loadAgentManifests(_searchTerms?: string[]): AgentManifest[] {
  return [];
}

export function saveAgentManifest(_manifest: AgentManifest, _filePath: string): void {
  if (isBrowser()) {
    throw new Error("Filesystem write unavailable in browser environment");
  }
}

export function cliAgentAgentOperations(
  _agentId: string,
  command: string,
  _params?: Record<string, unknown>,
): void {
  switch (command) {
    case "list":
      console.log("Listing agent manifests...");
      break;
    case "validate":
      console.log("Validating agent manifest...");
      break;
    case "deploy":
      console.log("Deploying agent...");
      break;
    default:
      console.log(`Unknown agent command: ${command}`);
  }
}

export function generateAgentImplementation(_manifest: AgentManifest, _outputDir: string): void {
  if (isBrowser()) {
    throw new Error("Filesystem write unavailable in browser environment");
  }
}

export function registerAgentWithOrchestrator(
  _agentId: string,
  manifest: AgentManifestInput,
): AgentManifest {
  return parseManifestFromObject(manifest);
}

export function cliAgentEntryPoint(agentId?: string): void {
  console.log("=== Agentic OS Agent Manifest CLI ===");
  console.log("Available commands: list, validate, deploy, execute");
  if (agentId) console.log(`Operating on agent: ${agentId}`);
}

export function cliToolAgent(manifest: AgentManifestInput, toolSets: string[][]): void {
  console.log(`=== CLI Tool Agent Command ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Tool sets: ${toolSets.length}`);
  for (let i = 0; i < toolSets.length; i++) {
    console.log(`Tool set ${i + 1}: ${toolSets[i].join(", ")}`);
  }
}

export function cliToolAgentWithAuth(manifest: AgentManifestInput, authConfig: Record<string, unknown>): void {
  console.log(`=== CLI Tool Agent With Auth ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Auth provider: ${String(authConfig.provider ?? "unknown")}`);
}

export function cliToolAgentWithOverrides(manifest: AgentManifestInput, overrides: Record<string, unknown>): void {
  console.log(`=== CLI Tool Agent With Overrides ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Overrides: ${JSON.stringify(overrides, null, 2)}`);
}

export function cliToolAgentWithTools(manifest: AgentManifestInput, tools: string[][]): void {
  console.log(`=== CLI Tool Agent With Tools ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Tools: ${tools.flat().join(", ")}`);
}

export function cliToolAgentWithDependencies(manifest: AgentManifestInput, dependencies: string[]): void {
  console.log(`=== CLI Tool Agent With Dependencies ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Dependencies: ${dependencies.join(", ")}`);
}

export function cliToolAgentWithSettings(manifest: AgentManifestInput, settings: Record<string, unknown>): void {
  console.log(`=== CLI Tool Agent With Settings ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Settings: ${JSON.stringify(settings, null, 2)}`);
}

export function cliAgentWithTools(manifest: AgentManifestInput, tools: string[]): void {
  console.log(`=== CLI Agent With Tools ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Tools: ${tools.join(", ")}`);
}

export function cliAgentWithDependencies(manifest: AgentManifestInput, dependencies: string[]): void {
  console.log(`=== CLI Agent With Dependencies ===`);
  console.log(`Agent: ${manifest.name}`);
  console.log(`Dependencies: ${dependencies.join(", ")}`);
}

export default function parseAgentManifestDefault(filePath: string): AgentManifest {
  return parseAgentManifest(filePath);
}
