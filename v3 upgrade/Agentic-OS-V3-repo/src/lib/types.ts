/**
 * types.ts — typed domain models for NEXUS 2.0 and Zod input schemas.
 * Every API/MCP boundary validates against these schemas; nothing reaches
 * the engine unvalidated.
 */
import { z } from "zod";

export const MEMORY_KINDS = ["episodic", "semantic", "preference", "reflexion", "fact"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const SCOPES = [
  "memory:read",
  "memory:write",
  "skill:read",
  "skill:write",
  "brain:admin",
  "vault:read",
  "vault:write",
  "safety:write",
  "audit:read",
] as const;
export type Scope = (typeof SCOPES)[number];

export const SKILL_OUTCOME = ["success", "failure"] as const;
export type SkillOutcome = (typeof SKILL_OUTCOME)[number];

export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  tags: string[];
  importance: number; // 0..1
  source: string;
  projectId: string | null;
  tokenCost: number;
  recallCount: number;
  createdAt: number;
  updatedAt: number;
  lastRecalledAt: number | null;
}

export interface Skill {
  id: string;
  name: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  trigger: string | null;
  rating: number; // 0..1
  useCount: number;
  successCount: number;
  failureCount: number;
  source: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  source: string;
  status: "active" | "archived" | "transferred";
  memoryCount: number;
  skillCount: number;
  tokenFootprint: number;
  metadata: Record<string, string | number>;
  createdAt: number;
  updatedAt: number;
}

export interface VaultFile {
  path: string; // virtual path under /vault
  content: string;
  mtime: number;
}

export interface Note {
  id: string;
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, string>;
  tags: string[];
  wikilinks: string[];
  charCount: number;
  mtime: number | null;
  indexedAt: number;
}

export interface AuditEntry {
  sequence: number;
  id: string;
  actor: string;
  action: string;
  payload: unknown;
  prevHash: string;
  entryHash: string;
  createdAt: number;
}

export type LedgerEventType =
  | "recall"
  | "capture"
  | "transfer"
  | "compress"
  | "export"
  | "import"
  | "checkpoint";

export interface LedgerEntry {
  id: string;
  eventType: LedgerEventType;
  query: string;
  tokensInjected: number;
  tokensReused: number;
  tokensSaved: number;
  itemsReturned: number;
  real: boolean;
  createdAt: number;
}

export interface Feedback {
  id: string;
  query: string;
  itemId: string;
  itemType: "memory" | "skill" | "note";
  helpful: boolean;
  createdAt: number;
}

export interface Principal {
  id: string;
  name: string;
  keyHash: string;
  keyPreview: string; // last 4 chars only — never the raw key
  scopes: Scope[];
  status: "active" | "disabled";
  createdAt: number;
  lastUsedAt: number | null;
}

export interface NexusState {
  memories: Memory[];
  skills: Skill[];
  projects: Project[];
  notes: Note[];
  audit: AuditEntry[];
  ledger: LedgerEntry[];
  feedback: Feedback[];
  meta: Record<string, string>;
  principals: Principal[];
  vaultFiles: VaultFile[];
}

export interface Envelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; status?: number };
  traceId: string;
}

export interface RecallItem {
  id: string;
  type: "memory" | "skill" | "note";
  title: string;
  content: string;
  score: number;
  tokenCost: number;
  source: string;
}

export interface RecallResult {
  query: string;
  returned: RecallItem[];
  tokensUsed: number;
  tokenBudget: number;
  truncated: number;
  mode: "semantic" | "lexical";
}

/* ------------------------------------------------------------------ *
 * Zod input schemas
 * ------------------------------------------------------------------ */

export const memoryInputSchema = z.object({
  kind: z.enum(MEMORY_KINDS).default("semantic"),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  source: z.string().trim().max(120).default("manual"),
  projectId: z.string().trim().max(80).nullable().default(null),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;

export const memoryPatchSchema = memoryInputSchema.partial();
export type MemoryPatch = z.infer<typeof memoryPatchSchema>;

export const skillInputSchema = z.object({
  name: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "name must be lowercase kebab-case"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(400),
  content: z.string().trim().min(1),
  category: z.string().trim().min(1).max(60).default("general"),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  trigger: z.string().trim().max(200).nullable().default(null),
  source: z.string().trim().max(120).default("manual"),
  projectId: z.string().trim().max(80).nullable().default(null),
});
export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillOutcomeSchema = z.object({
  outcome: z.enum(SKILL_OUTCOME),
});
export type SkillOutcomeInput = z.infer<typeof skillOutcomeSchema>;

export const captureInputSchema = z.object({
  transcript: z.string().trim().min(1),
  projectName: z.string().trim().max(120).optional(),
  forceFail: z.boolean().default(false),
});
export type CaptureInput = z.infer<typeof captureInputSchema>;

export const checkpointInputSchema = z.object({
  label: z.string().trim().max(160).default("checkpoint"),
  context: z.string().trim().min(1),
  projectName: z.string().trim().max(120).optional(),
});
export type CheckpointInput = z.infer<typeof checkpointInputSchema>;

export const fileInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
  content: z.string(),
});

export const transferInputSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  memories: z.array(memoryInputSchema.omit({ projectId: true })).max(200).default([]),
  skills: z.array(skillInputSchema).max(200).default([]),
  transcript: z.string().optional(),
  files: z.array(fileInputSchema).max(100).default([]),
});
export type TransferInput = z.infer<typeof transferInputSchema>;

export const recallQuerySchema = z.object({
  q: z.string().trim().min(1),
  budget: z.number().int().min(64).max(8192).default(1500),
});
export type RecallQuery = z.infer<typeof recallQuerySchema>;

export const recallConversationSchema = z.object({
  query: z.string().trim().min(1),
  budget: z.number().int().min(64).max(8192).default(1500),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).max(50).default([]),
});

export const vaultNoteInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
  content: z.string(),
});

export const writeBackInputSchema = z.object({
  memoryId: z.string().trim().min(1),
  path: z.string().trim().min(1).max(500).optional(),
});

export const killSwitchInputSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const principalInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(SCOPES)).min(1),
});

/** Brain export payload schema — used to validate imports (cannot inject invalid schema). */
export const brainExportSchema = z.object({
  format: z.literal("nexus-brain"),
  version: z.number(),
  exportedAt: z.number(),
  memories: z.array(memoryInputSchema).default([]),
  skills: z.array(skillInputSchema).default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        source: z.string().default("import"),
      })
    )
    .default([]),
  notes: z
    .array(
      z.object({
        path: z.string(),
        title: z.string().default(""),
        content: z.string(),
      })
    )
    .default([]),
});
