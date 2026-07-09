/**
 * specialization-registry.ts — Phase 13.5 specialization registry + skill
 * matching (PURE, operates on AgentCapability from @agentic-os/a2a-server).
 *
 * The registry holds capabilities advertised by agents (fed by swarm gossip,
 * kernel agent list, or MCP discovery). `match(task)` ranks candidate agents
 * by role/skill overlap, capability version, reputation, cost and load. The
 * actual transport (gossip / kernel) is wired by the orchestrator core; this
 * module is the pure ranking engine.
 */
import { z } from 'zod';
import { AgentCapability, AgentCapabilitySchema } from '@agentic-os/a2a-server';
import { log } from '../lib/logging.js';

const CapabilityVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, 'semver required');
export type CapabilityVersion = z.infer<typeof CapabilityVersionSchema>;

export interface RegisteredAgent {
  agentId: string;
  capability: AgentCapability;
  version: CapabilityVersion;
  /** reputation in [0,1]; higher is better. */
  reputation: number;
  /** estimated cost tier 1..5; lower is cheaper. */
  costTier: number;
  /** current normalized load 0..1; lower is more available. */
  load: number;
  /** optional min reputation accepted by the task. */
  available: boolean;
}

export interface MatchRequest {
  /** required capability name (or skill id). */
  capability: string;
  domain?: string;
  /** minimum accepted reputation (0..1). */
  minReputation?: number;
  /** maximum accepted cost tier (1..5). */
  maxCostTier?: number;
  /** prefer lowest cost subject to deadline. */
  costOptimized?: boolean;
}

export class SpecializationRegistry {
  private agents = new Map<string, RegisteredAgent>();

  register(agent: RegisteredAgent): void {
    AgentCapabilitySchema.parse(agent.capability);
    CapabilityVersionSchema.parse(agent.version);
    this.agents.set(agent.agentId, agent);
    log.debug('registry.register', { agentId: agent.agentId, cap: agent.capability.name });
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  list(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  /** Pure ranking: score = overlap * reputation - costPenalty - loadPenalty. */
  match(req: MatchRequest): RegisteredAgent[] {
    const scored: { agent: RegisteredAgent; score: number }[] = [];
    for (const a of this.agents.values()) {
      if (!a.available) continue;
      if (a.capability.name !== req.capability) continue;
      if (req.domain && a.capability.domain !== req.domain) continue;
      if (req.minReputation !== undefined && a.reputation < req.minReputation) continue;
      if (req.maxCostTier !== undefined && a.costTier > req.maxCostTier) continue;

      const overlap = 1; // exact capability match
      const reputation = a.reputation;
      const costPenalty = (a.costTier - 1) / 4; // 0..1
      const loadPenalty = a.load; // 0..1
      let score = overlap * 0.4 + reputation * 0.4 - costPenalty * 0.1 - loadPenalty * 0.1;
      if (req.costOptimized) score = score - costPenalty * 0.5; // bias toward cheap
      scored.push({ agent: a, score });
    }
    scored.sort((x, y) => y.score - x.score);
    return scored.map((s) => s.agent);
  }

  /** Top pick, or undefined if none available. */
  pick(req: MatchRequest): RegisteredAgent | undefined {
    return this.match(req)[0];
  }
}
