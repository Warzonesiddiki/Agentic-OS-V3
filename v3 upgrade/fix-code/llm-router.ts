import { getEnv } from "../lib/env.js";
import { estimateTokens } from "../lib/tokens.js";
import type { LLMResponse } from "./llm.js";
import { callLLMWithTrajectory } from "./llm-client.js";
import type { ClientOptions } from "./llm-client.js";

export type TaskComplexity = "simple" | "medium" | "complex";

export interface RouterConfig {
  simpleModel?: string;
  mediumModel?: string;
  complexModel?: string;
  simpleMaxTokens?: number;
  mediumMaxTokens?: number;
  complexMaxTokens?: number;
}

const DEFAULT_CONFIG: Required<RouterConfig> = {
  simpleModel: "gpt-4o-mini",
  mediumModel: "gpt-4o",
  complexModel: "gpt-4o",
  simpleMaxTokens: 1024,
  mediumMaxTokens: 4096,
  complexMaxTokens: 8192,
};

function classifyComplexity(query: string, contextTokens: number): TaskComplexity {
  if (contextTokens > 6000 || query.length > 2000) return "complex";
  if (contextTokens > 2000 || query.length > 500) return "medium";
  return "simple";
}

function selectModel(complexity: TaskComplexity, cfg: Required<RouterConfig>): string {
  if (complexity === "simple") return cfg.simpleModel;
  if (complexity === "medium") return cfg.mediumModel;
  return cfg.complexModel;
}

export async function callRoutedLLM(
  query: string,
  contextText: string,
  systemPrompt: string,
  opts: ClientOptions,
  config?: RouterConfig,
): Promise<LLMResponse> {
  const cfg = { ...DEFAULT_CONFIG, ...config, ...getEnvRouterOverrides() };
  const contextTokens = estimateTokens(contextText);
  const complexity = classifyComplexity(query, contextTokens);
  const model = selectModel(complexity, cfg);

  const maxTokens = complexity === "simple"
    ? cfg.simpleMaxTokens : complexity === "medium"
      ? cfg.mediumMaxTokens : cfg.complexMaxTokens;

  const userContent = contextText.trim().length > 0
    ? `${query}

---
Relevant context:
${contextText}`
    : query;

  return callLLMWithTrajectory(
    {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens,
      temperature: complexity === "simple" ? 0.3 : 0.7,
    },
    { ...opts, circuitBreakerKey: `routed:${opts.agentId}:${complexity}:${model}` },
  );
}

function getEnvRouterOverrides(): Partial<RouterConfig> {
  const e = getEnv();
  const overrides: Partial<RouterConfig> = {};
  // Tier-specific overrides take priority.
  if (e.NEXUS_LLM_SIMPLE_MODEL) overrides.simpleModel = e.NEXUS_LLM_SIMPLE_MODEL;
  if (e.NEXUS_LLM_MEDIUM_MODEL) overrides.mediumModel = e.NEXUS_LLM_MEDIUM_MODEL;
  if (e.NEXUS_LLM_COMPLEX_MODEL) overrides.complexModel = e.NEXUS_LLM_COMPLEX_MODEL;
  // Fallback to generic model if no tier-specific override.
  if (e.NEXUS_LLM_MODEL) {
    if (!overrides.simpleModel) overrides.simpleModel = e.NEXUS_LLM_MODEL;
    if (!overrides.mediumModel) overrides.mediumModel = e.NEXUS_LLM_MODEL;
    if (!overrides.complexModel) overrides.complexModel = e.NEXUS_LLM_MODEL;
  }
  return overrides;
}
