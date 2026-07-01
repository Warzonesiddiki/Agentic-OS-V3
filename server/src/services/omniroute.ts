/**
 * omniroute.ts — OmniRoute integration bridge for Nexus Agentic OS.
 *
 * Provides unified access to OmniRoute's 160+ providers, combo resolution,
 * fallback policies, semantic caching, guardrails, memory, skills, and
 * assessment systems through Nexus's Hono+PostgreSQL stack.
 *
 * Extracted from https://github.com/diegosouzapw/OmniRoute (MIT License)
 * and adapted for Nexus's architecture.
 *
 * @module services/omniroute
 */

export { resolveComboModel } from "./domain/comboResolver.js";
export { fallbackPolicy, registerFallback, resolveFallback } from "./domain/fallbackPolicy.js";
export { runPipeline, type PipelineConfig, type PipelineResult, type StageExecutor } from "./domain/pipeline.js";
export { evaluatePolicy } from "./domain/policyEngine.js";
export { computeCost, type CostInput, type CostBreakdown } from "./domain/costRules.js";
export { checkDegradation, type DegradationResult } from "./domain/degradation.js";
export { routeByTag, type TagRoutingResult } from "./domain/tagRouter.js";
export { BaseGuardrail, type GuardrailContext, type GuardrailResult, type GuardrailExecutionResult } from "./guardrails/base.js";
export { GuardrailRegistry } from "./guardrails/registry.js";
export { type MemoryItem, type MemoryStore, type MemoryQuery } from "./memory/types.js";
export { type SkillManifest as OmniSkillManifest, type SkillExecutor as OmniSkillExecutor } from "./skills/types.js";
export { SkillRegistry as OmniSkillRegistry } from "./skills/registry.js";
export { type AssessmentResult, type AssessmentCategory } from "./domain/assessment/types.js";
export { assess } from "./domain/assessment/index.js";
