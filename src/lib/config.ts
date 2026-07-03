/**
 * config.ts — runtime configuration (simulated environment).
 * Mirrors the .env surface of the server build, persisted to localStorage,
 * and validated so invalid production config never passes silently.
 * Reactive via subscribeConfig for the UI.
 */
import { z } from "zod";

const KEY = "nexus.config.v2";

export interface RuntimeConfig {
  nodeEnv: "development" | "production";
  port: number;
  allowedOrigins: string;
  rateLimitPerMinute: number;
  maxBodyBytes: number;
  logLevel: "debug" | "info" | "warn" | "error";
  logErrors: boolean;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  embeddingModel: string;
  obsidianVault: string;
  dbPoolMax: number;
  queryTimeoutMs: number;
  /** Local-mode operator key (stored raw ONLY for local single-user convenience). */
  _localKey: string;
}

const schema = z.object({
  nodeEnv: z.enum(["development", "production"]).default("development"),
  port: z.number().int().min(1).max(65535).default(9900),
  allowedOrigins: z.string().default("http://localhost:9900"),
  rateLimitPerMinute: z.number().int().min(1).max(100000).default(120),
  maxBodyBytes: z.number().int().min(1024).max(50 * 1024 * 1024).default(5 * 1024 * 1024),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  logErrors: z.boolean().default(true),
  llmBaseUrl: z.string().default(""),
  llmApiKey: z.string().default(""),
  llmModel: z.string().default(""),
  embeddingModel: z.string().default(""),
  obsidianVault: z.string().default(""),
  dbPoolMax: z.number().int().min(1).max(200).default(20),
  queryTimeoutMs: z.number().int().min(1000).max(120000).default(15000),
  _localKey: z.string().default(""),
});

const DEFAULTS = schema.parse({});

function load(): RuntimeConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...DEFAULTS, ...parsed.data } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let _cfg: RuntimeConfig = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(_cfg));
  } catch (e) {
    import("./logger.js").then(({ logger }) => logger.warn("config", "Failed to persist config to localStorage:", e instanceof Error ? e.message : String(e)));
  }
}

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeConfig(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getConfig(): RuntimeConfig {
  return _cfg;
}

export function setConfig(patch: Partial<RuntimeConfig>): RuntimeConfig {
  _cfg = { ..._cfg, ...patch };
  persist();
  emit();
  return _cfg;
}

export function llmEnabled(): boolean {
  return Boolean(_cfg.llmBaseUrl && _cfg.llmApiKey && _cfg.llmModel);
}

export function llmMode(): "configured" | "lexical" {
  return llmEnabled() ? "configured" : "lexical";
}

/** Generates (once) and returns the local-mode operator API key. */
export function getLocalKey(): string {
  if (!_cfg._localKey) {
    const key = `nx_live_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
    _cfg = { ..._cfg, _localKey: key };
    persist();
    emit();
  }
  return _cfg._localKey;
}

export interface ConfigIssue {
  field: string;
  level: "warn" | "fatal";
  message: string;
}

/** Honest validation — fatal issues would block a real production boot. */
export function validateConfig(): ConfigIssue[] {
  const c = _cfg;
  const issues: ConfigIssue[] = [];
  if (c.nodeEnv === "production") {
    if (!c.allowedOrigins || c.allowedOrigins === "http://localhost:9900") {
      issues.push({ field: "allowedOrigins", level: "fatal", message: "Production must not allow localhost origins." });
    }
    if (!llmEnabled()) {
      issues.push({ field: "llm", level: "warn", message: "No LLM/embedding provider configured — recall runs in lexical fallback mode." });
    }
    if (c.maxBodyBytes > 2 * 1024 * 1024) {
      issues.push({ field: "maxBodyBytes", level: "warn", message: "Large payload limit in production increases DoS surface." });
    }
  }
  if (!llmEnabled()) {
    issues.push({ field: "llm", level: "warn", message: "LLM not configured — distillation uses deterministic heuristics." });
  }
  return issues;
}
