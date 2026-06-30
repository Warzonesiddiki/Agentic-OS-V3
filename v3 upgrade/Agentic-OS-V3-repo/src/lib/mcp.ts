/**
 * mcp.ts — Model Context Protocol surface for NEXUS 2.0.
 * Tools, resources, and prompts. MCP never bypasses REST security: every
 * tool validates arguments with Zod, respects the kill switch, maps to a
 * required scope, and routes through the same domain operations + audit.
 */
import { z } from "zod";
import { lexicalScores, truncate } from "./core";
import { recall } from "./recall";
import { createMemory, captureSession, checkpoint, transferProject, recordFeedback } from "./operations";
import { compressBrain, exportBrain, indexVault, rebuildEmbeddings, verifyAudit, writeBack } from "./brain";
import { getState } from "./engine";
import { ambient } from "./recall";
import { MEMORY_KINDS } from "./types";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const toolSchemas = {
  recall: z.object({ query: z.string().min(1), budget: z.number().int().min(64).max(8192).default(1500) }),
  ask: z.object({ question: z.string().min(1), budget: z.number().int().min(64).max(8192).default(1500) }),
  remember: z.object({
    kind: z.enum(MEMORY_KINDS).default("semantic"),
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    tags: z.array(z.string()).default([]),
    importance: z.number().min(0).max(1).default(0.5),
  }),
  capture: z.object({ transcript: z.string().min(1), projectName: z.string().optional() }),
  checkpoint: z.object({ label: z.string().min(1).max(160), context: z.string().min(1), projectName: z.string().optional() }),
  skill: z.object({ query: z.string().default("") }),
  transfer: z.object({
    projectName: z.string().min(1),
    memories: z.array(z.object({ kind: z.enum(MEMORY_KINDS).default("semantic"), title: z.string(), content: z.string(), tags: z.array(z.string()).default([]), importance: z.number().default(0.5), source: z.string().default("mcp") })).default([]),
    skills: z.array(z.object({ name: z.string(), title: z.string(), description: z.string(), content: z.string(), category: z.string().default("general"), tags: z.array(z.string()).default([]), trigger: z.string().nullable().default(null), source: z.string().default("mcp") })).default([]),
    transcript: z.string().optional(),
  }),
  feedback: z.object({ itemId: z.string(), itemType: z.enum(["memory", "skill", "note"]), helpful: z.boolean(), query: z.string().default("") }),
  vault: z.object({ action: z.enum(["sync", "writeback", "list"]), memoryId: z.string().optional(), path: z.string().optional() }),
  maintain: z.object({ action: z.enum(["export", "compress", "verify", "embeddings"]) }),
};

export const MCP_TOOLS: McpTool[] = [
  { name: "nexus_recall", description: "Token-budgeted recall across memories, skills, and notes.", inputSchema: zodToMeta(toolSchemas.recall) },
  { name: "nexus_ask", description: "Recall relevant context and compose a concise grounding answer.", inputSchema: zodToMeta(toolSchemas.ask) },
  { name: "nexus_remember", description: "Store a durable memory.", inputSchema: zodToMeta(toolSchemas.remember) },
  { name: "nexus_capture", description: "Capture a session transcript and distill it into memories/skills.", inputSchema: zodToMeta(toolSchemas.capture) },
  { name: "nexus_checkpoint", description: "Snapshot working context as a checkpoint memory.", inputSchema: zodToMeta(toolSchemas.checkpoint) },
  { name: "nexus_skill", description: "Search the skills library.", inputSchema: zodToMeta(toolSchemas.skill) },
  { name: "nexus_transfer", description: "Transfer knowledge from a previous project.", inputSchema: zodToMeta(toolSchemas.transfer) },
  { name: "nexus_feedback", description: "Record recall relevance feedback.", inputSchema: zodToMeta(toolSchemas.feedback) },
  { name: "nexus_vault", description: "Sync the Obsidian vault or write a memory back to it.", inputSchema: zodToMeta(toolSchemas.vault) },
  { name: "nexus_maintain", description: "Export, compress, verify, or rebuild the brain.", inputSchema: zodToMeta(toolSchemas.maintain) },
];

export function toolRequiredScope(name: string, args?: Record<string, unknown>): string | null {
  switch (name) {
    case "nexus_recall":
    case "nexus_ask":
    case "nexus_skill":
      return "memory:read";
    case "nexus_remember":
    case "nexus_capture":
    case "nexus_checkpoint":
    case "nexus_transfer":
    case "nexus_feedback":
      return "memory:write";
    case "nexus_vault":
      return args?.action === "list" ? "vault:read" : "vault:write";
    case "nexus_maintain":
      return "brain:admin";
    default:
      return null;
  }
}

export interface McpContext {
  actor: string;
}

export function callMcpTool(name: string, rawArgs: unknown, ctx: McpContext): unknown {
  switch (name) {
    case "nexus_recall": {
      const a = toolSchemas.recall.parse(rawArgs);
      return recall(a.query, a.budget, ctx.actor);
    }
    case "nexus_ask": {
      const a = toolSchemas.ask.parse(rawArgs);
      const r = recall(a.question, a.budget, ctx.actor);
      const top = r.returned[0];
      const answer = top ? `Based on "${top.title}": ${truncate(top.content, 280)}` : "No relevant memories found.";
      return { answer, sources: r.returned.map((i) => ({ type: i.type, title: i.title, score: i.score })), tokensUsed: r.tokensUsed };
    }
    case "nexus_remember": {
      const a = toolSchemas.remember.parse(rawArgs);
      const mem = createMemory({ ...a, source: "mcp", projectId: null }, ctx.actor);
      return { id: mem.id, title: mem.title, tokenCost: mem.tokenCost };
    }
    case "nexus_capture": {
      const a = toolSchemas.capture.parse(rawArgs);
      return captureSession({ transcript: a.transcript, projectName: a.projectName, forceFail: false }, ctx.actor);
    }
    case "nexus_checkpoint": {
      const a = toolSchemas.checkpoint.parse(rawArgs);
      const mem = checkpoint({ label: a.label, context: a.context, projectName: a.projectName }, ctx.actor);
      return { id: mem.id, label: mem.title };
    }
    case "nexus_skill": {
      const a = toolSchemas.skill.parse(rawArgs);
      const skills = getState().skills;
      const docs = skills.map((s) => ({ id: s.id, text: `${s.title} ${s.description} ${s.trigger ?? ""}` }));
      const scores = lexicalScores(docs, a.query);
      const ranked = [...skills]
        .map((s) => ({ s, sc: scores.get(s.id) ?? 0 }))
        .sort((x, y) => y.sc - x.sc)
        .slice(0, 5);
      return { skills: ranked.map(({ s, sc }) => ({ name: s.name, title: s.title, rating: Math.round(s.rating * 100) / 100, useCount: s.useCount, score: Math.round(sc * 1000) / 1000 })) };
    }
    case "nexus_transfer": {
      const a = toolSchemas.transfer.parse(rawArgs);
      return transferProject(
        { projectName: a.projectName, description: "", memories: a.memories, skills: a.skills.map((s) => ({ ...s, projectId: null })), transcript: a.transcript, files: [] },
        ctx.actor
      );
    }
    case "nexus_feedback": {
      const a = toolSchemas.feedback.parse(rawArgs);
      recordFeedback(a.query, a.itemId, a.itemType, a.helpful, ctx.actor);
      return { recorded: true };
    }
    case "nexus_vault": {
      const a = toolSchemas.vault.parse(rawArgs);
      if (a.action === "sync") return indexVault(ctx.actor);
      if (a.action === "writeback") {
        if (!a.memoryId) throw new Error("memoryId required for writeback");
        return writeBack(a.memoryId, a.path, ctx.actor);
      }
      return { notes: getState().notes.map((n) => ({ path: n.path, title: n.title, tags: n.tags })) };
    }
    case "nexus_maintain": {
      const a = toolSchemas.maintain.parse(rawArgs);
      if (a.action === "export") return { format: exportBrain().format, bytes: JSON.stringify(exportBrain()).length, memories: exportBrain().memories.length };
      if (a.action === "compress") return compressBrain(ctx.actor);
      if (a.action === "verify") return verifyAudit();
      return rebuildEmbeddings();
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const MCP_RESOURCES = [
  { uri: "nexus://brain/ambient", name: "Ambient context", description: "Compact always-on brain context.", mimeType: "text/markdown" },
  { uri: "nexus://brain/last-session", name: "Last session", description: "Most recent session/checkpoint memory.", mimeType: "text/markdown" },
  { uri: "nexus://brain/health", name: "Health", description: "System health snapshot.", mimeType: "application/json" },
  { uri: "nexus://brain/stats", name: "Stats", description: "Brain statistics.", mimeType: "application/json" },
];

export function readResource(uri: string): { uri: string; mimeType: string; text: string } {
  const base = { uri };
  switch (uri) {
    case "nexus://brain/ambient": {
      const a = ambient();
      return { ...base, mimeType: "text/markdown", text: a.text };
    }
    case "nexus://brain/last-session": {
      const mem = getState().memories.find((m) => m.source === "checkpoint" || m.source === "session-raw") ?? getState().memories[0];
      return { ...base, mimeType: "text/markdown", text: mem ? `# ${mem.title}\n\n${mem.content}` : "(empty)" };
    }
    case "nexus://brain/health": {
      const s = getState();
      return { ...base, mimeType: "application/json", text: JSON.stringify({ db: "ok", memories: s.memories.length, killSwitch: s.meta.killSwitch === "1", auditEntries: s.audit.length }) };
    }
    case "nexus://brain/stats": {
      const s = getState();
      return { ...base, mimeType: "application/json", text: JSON.stringify({ memories: s.memories.length, skills: s.skills.length, notes: s.notes.length, projects: s.projects.length, tokensSaved: s.ledger.reduce((a2, e) => a2 + e.tokensSaved, 0) }) };
    }
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}

export const MCP_PROMPTS = [
  { name: "recall-and-execute", description: "Ground a task in recalled memory, then execute.", arguments: [{ name: "query", required: true }] },
  { name: "resume-work", description: "Resume from the last checkpoint.", arguments: [] },
  { name: "capture-session", description: "Distill a transcript into durable knowledge.", arguments: [{ name: "transcript", required: true }] },
];

export function getPrompt(name: string, args: Record<string, string>): { messages: { role: string; content: { type: string; text: string } }[] } {
  if (name === "recall-and-execute") {
    const q = args.query ?? "";
    const a = ambient();
    return { messages: [{ role: "user", content: { type: "text", text: `Ambient context:\n${a.text}\n\nTask: ${q}\n\nRecall relevant memories with nexus_recall, then carry out the task.` } }] };
  }
  if (name === "resume-work") {
    return { messages: [{ role: "user", content: { type: "text", text: "Read nexus://brain/last-session and nexus://brain/ambient, then summarize where work left off and propose the next step." } }] };
  }
  if (name === "capture-session") {
    const t = args.transcript ?? "(paste transcript)";
    return { messages: [{ role: "user", content: { type: "text", text: `Distill this transcript into memories and skills using nexus_capture, then summarize what was learned:\n\n${t}` } }] };
  }
  throw new Error(`Unknown prompt: ${name}`);
}

/** Extract `.shape` from a Zod object schema. Zod v4 exposes shape only on
 *  ZodObject (not the base ZodType), so we type-narrow via the discriminator. */
function getZodShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  const candidate = schema as z.ZodTypeAny & { shape?: Record<string, z.ZodTypeAny> };
  if (candidate.shape && typeof candidate.shape === "object" && !Array.isArray(candidate.shape)) {
    return candidate.shape;
  }
  return null;
}

/** Minimal JSON-Schema-ish metadata for tool listing. */
function zodToMeta(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = getZodShape(schema);
  if (!shape) return { type: "object" };
  const props: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, v] of Object.entries(shape)) {
    props[k] = { type: v instanceof z.ZodNumber ? "number" : v instanceof z.ZodBoolean ? "boolean" : v instanceof z.ZodArray ? "array" : "string" };
    const isOpt = v.isOptional();
    if (!isOpt) required.push(k);
  }
  return { type: "object", properties: props, required };
}
