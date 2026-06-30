/**
 * pipeline-io.ts — Pipeline YAML/JSON serialization (Phase 5d)
 *
 * Export/import pipeline DAGs as YAML or JSON with schema validation,
 * version compatibility checking, and a template system.
 *
 * Source: Haystack Pipeline.to_dict() / from_dict()
 */
import { load as yamlParse, dump as yamlStringify } from "js-yaml";
import { validateDAG as validateDagStructure, type PipelineDAG, type PipelineNode, type PipelineEdge } from "./pipeline-executor.js";
import { log } from "../lib/logging.js";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface PipelineMetadata {
  name: string;
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  /** Semantic version of the pipeline schema. */
  schemaVersion: number;
}

export interface SerializedNode extends PipelineNode {
  /** Human-readable label (defaults to id). */
  name?: string;
  /** Named input ports. */
  inputs?: string[];
  /** Named output ports. */
  outputs?: string[];
}

export interface SerializedEdge extends PipelineEdge {
  /** Source port name. */
  fromOutput?: string;
  /** Target port name. */
  toInput?: string;
  /** Optional conditional expression (e.g. "result.ok === true"). */
  condition?: string | null;
}

export interface SerializedPipeline {
  metadata: PipelineMetadata;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

export interface PipelineTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  pipeline: SerializedPipeline;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/* ─── Constants ───────────────────────────────────────────────────────────── */

const CURRENT_SCHEMA_VERSION = 1;
const MIN_SUPPORTED_VERSION = 1;

const BUILT_IN_TEMPLATES: PipelineTemplate[] = [
  {
    name: "simple-chat",
    description: "Manual trigger → LLM agent → output sink",
    category: "basic",
    tags: ["chat", "llm", "single-agent"],
    pipeline: {
      metadata: { name: "Simple Chat", schemaVersion: CURRENT_SCHEMA_VERSION, tags: ["chat"] },
      nodes: [
        { id: "trigger", type: "trigger.manual", name: "User Input", position: { x: 250, y: 0 }, config: {}, inputs: [], outputs: ["message"] },
        { id: "agent", type: "agent.run", name: "AI Agent", position: { x: 250, y: 150 }, config: { model: "m3-reasoning" }, inputs: ["prompt"], outputs: ["response"] },
        { id: "output", type: "output.sink", name: "Result", position: { x: 250, y: 300 }, config: {}, inputs: ["result"], outputs: [] },
      ],
      edges: [
        { from: "trigger", to: "agent", fromOutput: "message", toInput: "prompt" },
        { from: "agent", to: "output", fromOutput: "response", toInput: "result" },
      ],
    },
  },
  {
    name: "guardrail-gate",
    description: "Manual trigger → guardrail check → LLM (if passes) → output",
    category: "safety",
    tags: ["guardrail", "validation", "safety"],
    pipeline: {
      metadata: { name: "Guardrail Gate", schemaVersion: CURRENT_SCHEMA_VERSION, tags: ["guardrail"] },
      nodes: [
        { id: "trigger", type: "trigger.manual", name: "Input", position: { x: 250, y: 0 }, config: {}, inputs: [], outputs: ["data"] },
        { id: "check", type: "guardrail.check", name: "Content Check", position: { x: 250, y: 130 }, config: { pattern: "^[\\w\\s]+$", flags: "i" }, inputs: ["input"], outputs: ["result"] },
        { id: "agent", type: "agent.run", name: "AI Agent", position: { x: 250, y: 260 }, config: { model: "m3-reasoning" }, inputs: ["prompt"], outputs: ["response"] },
        { id: "output", type: "output.sink", name: "Result", position: { x: 250, y: 390 }, config: {}, inputs: ["result"], outputs: [] },
      ],
      edges: [
        { from: "trigger", to: "check", fromOutput: "data", toInput: "input" },
        { from: "check", to: "agent", fromOutput: "result", toInput: "prompt" },
        { from: "agent", to: "output", fromOutput: "response", toInput: "result" },
      ],
    },
  },
  {
    name: "tool-chain",
    description: "Trigger → tool call → LLM analyzes result → output",
    category: "tools",
    tags: ["tool", "chain", "automation"],
    pipeline: {
      metadata: { name: "Tool Chain", schemaVersion: CURRENT_SCHEMA_VERSION, tags: ["tool"] },
      nodes: [
        { id: "trigger", type: "trigger.manual", name: "Request", position: { x: 250, y: 0 }, config: {}, inputs: [], outputs: ["params"] },
        { id: "tool", type: "tool.invoke", name: "External Tool", position: { x: 250, y: 130 }, config: { tool: "web-search" }, inputs: ["input"], outputs: ["data"] },
        { id: "agent", type: "agent.run", name: "Analyzer", position: { x: 250, y: 260 }, config: { model: "m3-reasoning" }, inputs: ["context"], outputs: ["analysis"] },
        { id: "output", type: "output.sink", name: "Final", position: { x: 250, y: 390 }, config: {}, inputs: ["result"], outputs: [] },
      ],
      edges: [
        { from: "trigger", to: "tool", fromOutput: "params", toInput: "input" },
        { from: "tool", to: "agent", fromOutput: "data", toInput: "context" },
        { from: "agent", to: "output", fromOutput: "analysis", toInput: "result" },
      ],
    },
  },
];

/* ─── Validation ─────────────────────────────────────────────────────────--- */

function validateSchema(pipeline: SerializedPipeline): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!pipeline.metadata) {
    issues.push({ path: "metadata", message: "Missing pipeline metadata", severity: "error" });
    return { valid: false, issues };
  }

  if (!pipeline.metadata.name || typeof pipeline.metadata.name !== "string") {
    issues.push({ path: "metadata.name", message: "Pipeline name is required", severity: "error" });
  }

  if (typeof pipeline.metadata.schemaVersion !== "number") {
    issues.push({ path: "metadata.schemaVersion", message: "Schema version is required", severity: "error" });
  } else if (pipeline.metadata.schemaVersion < MIN_SUPPORTED_VERSION) {
    issues.push({ path: "metadata.schemaVersion", message: `Schema version ${pipeline.metadata.schemaVersion} is no longer supported (min: ${MIN_SUPPORTED_VERSION})`, severity: "error" });
  } else if (pipeline.metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
    issues.push({ path: "metadata.schemaVersion", message: `Schema version ${pipeline.metadata.schemaVersion} is newer than current (${CURRENT_SCHEMA_VERSION})`, severity: "warning" });
  }

  if (!Array.isArray(pipeline.nodes)) {
    issues.push({ path: "nodes", message: "Pipeline must have a nodes array", severity: "error" });
    return { valid: false, issues };
  }

  if (pipeline.nodes.length === 0) {
    issues.push({ path: "nodes", message: "Pipeline must have at least one node", severity: "error" });
  }

  const nodeIds = new Set<string>();
  pipeline.nodes.forEach((node, i) => {
    const prefix = `nodes[${i}]`;

    if (!node.id || typeof node.id !== "string") {
      issues.push({ path: `${prefix}.id`, message: "Node id is required", severity: "error" });
    } else if (nodeIds.has(node.id)) {
      issues.push({ path: `${prefix}.id`, message: `Duplicate node id: ${node.id}`, severity: "error" });
    } else {
      nodeIds.add(node.id);
    }

    if (!node.type) {
      issues.push({ path: `${prefix}.type`, message: "Node type is required", severity: "error" });
    }

    if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
      issues.push({ path: `${prefix}.position`, message: "Node must have a valid position {x, y}", severity: "warning" });
    }
  });

  if (Array.isArray(pipeline.edges)) {
    pipeline.edges.forEach((edge, i) => {
      const prefix = `edges[${i}]`;

      if (!edge.from || !edge.to) {
        issues.push({ path: `${prefix}`, message: "Edge must have 'from' and 'to' fields", severity: "error" });
        return;
      }

      if (!nodeIds.has(edge.from)) {
        issues.push({ path: `${prefix}.from`, message: `Edge references unknown node: ${edge.from}`, severity: "error" });
      }
      if (!nodeIds.has(edge.to)) {
        issues.push({ path: `${prefix}.to`, message: `Edge references unknown node: ${edge.to}`, severity: "error" });
      }
    });
  } else if (pipeline.nodes.length > 1) {
    issues.push({ path: "edges", message: "Pipeline with multiple nodes should have edges", severity: "warning" });
  }

  return { valid: issues.filter((i) => i.severity === "error").length === 0, issues };
}

function checkVersionCompatibility(version: number): { compatible: boolean; message?: string } {
  if (version < MIN_SUPPORTED_VERSION) {
    return { compatible: false, message: `Schema version ${version} is too old. Minimum supported: ${MIN_SUPPORTED_VERSION}. Use a migration tool to upgrade.` };
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return { compatible: false, message: `Schema version ${version} is from a newer version of the system. Current max: ${CURRENT_SCHEMA_VERSION}. Upgrade the server to import this pipeline.` };
  }
  return { compatible: true };
}

/* ─── Serialization ───────────────────────────────────────────────────────── */

function toDag(pipeline: SerializedPipeline): PipelineDAG {
  return {
    nodes: pipeline.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      config: n.config,
    })),
    edges: pipeline.edges.map((e) => ({
      from: e.from,
      to: e.to,
      fromPort: e.fromOutput,
      toPort: e.toInput,
    })),
  };
}

function fromDag(dag: PipelineDAG, metadata?: Partial<PipelineMetadata>): SerializedPipeline {
  return {
    metadata: {
      name: metadata?.name ?? "imported-pipeline",
      description: metadata?.description,
      author: metadata?.author,
      createdAt: metadata?.createdAt ?? new Date().toISOString(),
      tags: metadata?.tags,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    },
    nodes: dag.nodes.map((n) => ({
      ...n,
      name: n.id,
      inputs: [],
      outputs: [],
    })),
    edges: dag.edges.map((e) => ({
      from: e.from,
      to: e.to,
      fromOutput: e.fromPort,
      toInput: e.toPort,
      condition: null,
    })),
  };
}

/* ─── Public API ─────────────────────────────────────────────────────────--- */

export const PipelineIO = {
  /**
   * Export a pipeline DAG to a YAML string.
   * @param dag - The pipeline DAG to export.
   * @param metadata - Optional metadata to include.
   * @returns YAML string representation.
   */
  exportToYaml(dag: PipelineDAG, metadata?: Partial<PipelineMetadata>): string {
    const serialized = fromDag(dag, metadata);
    return yamlStringify(serialized, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
  },

  /**
   * Import a pipeline from a YAML string.
   * Returns the serialized pipeline and the derived DAG.
   * @throws If parsing fails or validation errors exist.
   */
  importFromYaml(yamlString: string): { pipeline: SerializedPipeline; dag: PipelineDAG; warnings: ValidationIssue[] } {
    let parsed: unknown;
    try {
      parsed = yamlParse(yamlString);
    } catch (e) {
      throw new Error(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return this.importFromObject(parsed as Record<string, unknown>);
  },

  /**
   * Export a pipeline DAG to a JSON string.
   */
  exportToJson(dag: PipelineDAG, metadata?: Partial<PipelineMetadata>): string {
    const serialized = fromDag(dag, metadata);
    return JSON.stringify(serialized, null, 2);
  },

  /**
   * Import a pipeline from a JSON string.
   * @throws If parsing fails or validation errors exist.
   */
  importFromJson(jsonString: string): { pipeline: SerializedPipeline; dag: PipelineDAG; warnings: ValidationIssue[] } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      throw new Error(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return this.importFromObject(parsed as Record<string, unknown>);
  },

  /**
   * Import a pipeline from a parsed object.
   * Validates the structure and checks version compatibility.
   */
  importFromObject(obj: Record<string, unknown>): { pipeline: SerializedPipeline; dag: PipelineDAG; warnings: ValidationIssue[] } {
    const pipeline = obj as unknown as SerializedPipeline;

    if (!pipeline.metadata) {
      pipeline.metadata = { name: "imported", schemaVersion: CURRENT_SCHEMA_VERSION };
    }

    if (!Array.isArray(pipeline.nodes)) {
      pipeline.nodes = [];
    }
    if (!Array.isArray(pipeline.edges)) {
      pipeline.edges = [];
    }

    const versionCheck = checkVersionCompatibility(pipeline.metadata.schemaVersion ?? CURRENT_SCHEMA_VERSION);
    if (!versionCheck.compatible) {
      throw new Error(versionCheck.message);
    }

    const validation = validateSchema(pipeline);
    if (!validation.valid) {
      const msgs = validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
      throw new Error(`Pipeline validation failed: ${msgs}`);
    }

    const dag = toDag(pipeline);

    const dagValidation = validateDagStructure(dag);
    if (!dagValidation.ok) {
      throw new Error(`Pipeline DAG validation failed: ${dagValidation.reason}`);
    }

    const warnings = validation.issues.filter((i) => i.severity === "warning");

    if (warnings.length > 0) {
      log.warn("pipeline-io.import_warnings", { warnings: warnings.map((w) => `${w.path}: ${w.message}`) });
    }

    return { pipeline, dag, warnings };
  },

  /**
   * Validate a serialized pipeline structure.
   */
  validateSchema(pipeline: SerializedPipeline): ValidationResult {
    return validateSchema(pipeline);
  },

  /**
   * Check if a schema version is compatible with this server.
   */
  checkVersion(version: number): ReturnType<typeof checkVersionCompatibility> {
    return checkVersionCompatibility(version);
  },

  /**
   * Get the current schema version supported by this server.
   */
  getCurrentVersion(): number {
    return CURRENT_SCHEMA_VERSION;
  },

  /* ─── Templates ──────────────────────────────────────────────────────── */

  /**
   * Get all predefined pipeline templates.
   */
  getTemplates(): PipelineTemplate[] {
    return [...BUILT_IN_TEMPLATES];
  },

  /**
   * Get templates filtered by category.
   */
  getTemplatesByCategory(category: string): PipelineTemplate[] {
    return BUILT_IN_TEMPLATES.filter((t) => t.category === category);
  },

  /**
   * Save a pipeline as a template (runtime only — not persisted to disk).
   * Returns the template object for the caller to persist as needed.
   */
  saveTemplate(pipeline: SerializedPipeline, category = "custom"): PipelineTemplate {
    const template: PipelineTemplate = {
      name: pipeline.metadata.name,
      description: pipeline.metadata.description ?? "",
      category,
      tags: pipeline.metadata.tags ?? [],
      pipeline,
    };
    return template;
  },

  /**
   * Load a predefined template by name.
   */
  loadTemplate(name: string): PipelineTemplate | undefined {
    return BUILT_IN_TEMPLATES.find((t) => t.name === name);
  },

  /**
   * Load a template and expand it into a SerializedPipeline + DAG.
   */
  loadTemplateAsPipeline(name: string): { pipeline: SerializedPipeline; dag: PipelineDAG } | undefined {
    const template = this.loadTemplate(name);
    if (!template) return undefined;
    const dag = toDag(template.pipeline);
    return { pipeline: template.pipeline, dag };
  },

  /**
   * Convert a SerializedPipeline back to a PipelineDAG for execution.
   */
  toDag(pipeline: SerializedPipeline): PipelineDAG {
    return toDag(pipeline);
  },

  /**
   * Convert a PipelineDAG to a SerializedPipeline with default metadata.
   */
  fromDag(dag: PipelineDAG, metadata?: Partial<PipelineMetadata>): SerializedPipeline {
    return fromDag(dag, metadata);
  },
};

export type PipelineIOInterface = typeof PipelineIO;
