import { db } from "../db/client.js";
import { trajectoryLogs } from "../db/schema.js";
import { callLLM, callLLMStructured } from "./llm.js";
import { withCircuitBreaker, validateWithRetry } from "./operations-ext.js";
import { log } from "../lib/logging.js";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { LLMRequest, LLMResponse } from "./llm.js";

export interface TrajectoryEntry {
  id: string;
  agentId: string;
  model: string;
  promptSent: string;
  responseReceived: string;
  tokenUsage: { prompt: number; completion: number; total: number };
  latencyMs: number;
}

export interface ClientOptions {
  agentId: string;
  circuitBreakerKey?: string;
  maxRetries?: number;
  traceId?: string;
}

async function logTrajectory(entry: Omit<TrajectoryEntry, "id">): Promise<void> {
  try {
    await db.insert(trajectoryLogs).values({
      id: `traj_${randomUUID()}`,
      auditSequence: 0,
      agentId: entry.agentId,
      model: entry.model,
      promptSent: entry.promptSent.slice(0, 10000),
      responseReceived: entry.responseReceived.slice(0, 10000),
      tokenUsage: entry.tokenUsage,
      latencyMs: entry.latencyMs,
    });
  } catch (e) {
    log.warn("trajectory_log_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function callLLMWithTrajectory(
  req: LLMRequest,
  opts: ClientOptions,
): Promise<LLMResponse> {
  const key = opts.circuitBreakerKey ?? `llm:${opts.agentId}`;

  return withCircuitBreaker(key, async () => {
    const start = Date.now();
    const promptForLog = req.messages.map((m) => `[${m.role}]\n${m.content.slice(0, 2000)}`).join("\n\n");

    try {
      const result = await callLLM(req);
      const latencyMs = Date.now() - start;

      await logTrajectory({
        agentId: opts.agentId,
        model: result.model,
        promptSent: promptForLog,
        responseReceived: result.content.slice(0, 10000),
        tokenUsage: result.usage,
        latencyMs,
      });

      return result;
    } catch (e) {
      const latencyMs = Date.now() - start;
      await logTrajectory({
        agentId: opts.agentId,
        model: "unknown",
        promptSent: promptForLog,
        responseReceived: `ERROR: ${e instanceof Error ? e.message : String(e)}`,
        tokenUsage: { prompt: 0, completion: 0, total: 0 },
        latencyMs,
      });
      throw e;
    }
  });
}

export async function callLLMStructuredWithTrajectory<T>(
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>,
  opts: ClientOptions,
): Promise<T> {
  const key = opts.circuitBreakerKey ?? `llm-structured:${opts.agentId}`;

  return withCircuitBreaker(key, async () => {
    const result = await validateWithRetry(schema, null, opts.maxRetries ?? 3, async (error, attempt) => {
      const start = Date.now();
      const promptForLog = `[system]\n${systemPrompt.slice(0, 2000)}\n\n[user]\n${userMessage.slice(0, 2000)}\n\n[correction][${attempt}]\n${error}`;

      try {
        const raw = await callLLMStructured<unknown>(systemPrompt, userMessage);
        const latencyMs = Date.now() - start;

        await logTrajectory({
          agentId: opts.agentId,
          model: "unknown",
          promptSent: promptForLog,
          responseReceived: JSON.stringify(raw).slice(0, 10000),
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          latencyMs,
        });

        return raw;
      } catch (e) {
        const latencyMs = Date.now() - start;
        await logTrajectory({
          agentId: opts.agentId,
          model: "unknown",
          promptSent: promptForLog,
          responseReceived: `ERROR: ${e instanceof Error ? e.message : String(e)}`,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          latencyMs,
        });
        throw e;
      }
    });

    if (!result.success || !result.data) {
      throw new Error(`Structured LLM call failed after ${result.attempts} attempts: ${result.error}`);
    }

    return result.data;
  });
}
