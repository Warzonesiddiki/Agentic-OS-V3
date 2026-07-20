/**
 * routes/health.ts — Health check endpoints
 */

import { Hono } from 'hono';
import { getEnv } from '../lib/env.js';
import { dbReachable, isPgvectorInstalled } from '../setup.js';
import { isKillSwitchOn } from '../services/safety.service.js';

const router = new Hono();

const startTime = Date.now();

router.get('/api/v1/health', async (c) => {
  const env = getEnv();
  const [dbOk, pgvectorOk, killSwitchOn] = await Promise.all([
    dbReachable(),
    isPgvectorInstalled(),
    isKillSwitchOn(),
  ]);

  const status = dbOk ? 'healthy' : 'unhealthy';
  
  return c.json({
    ok: true,
    data: {
      status,
      database: dbOk,
      pgvector: pgvectorOk,
      killSwitch: killSwitchOn,
      version: '2.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      environment: env.NODE_ENV,
    },
  });
});

router.get('/api/v1/metrics', async (c) => {
  // Prometheus metrics endpoint
  const { metricsOutput } = await import('../services/metrics.js');
  const metrics = await metricsOutput();
  
  c.header('Content-Type', metrics.contentType);
  return c.body(metrics.body);
});

router.get('/api/v1/system', async (c) => {
  const env = getEnv();
  
  // Get entity counts from database
  let memoryCount = 0;
  let skillCount = 0;
  let agentCount = 0;
  
  try {
    const { db } = await import('../db/client.js');
    const { memories, skills, agents } = await import('../db/client.js');
    
    const [memoriesResult, skillsResult, agentsResult] = await Promise.all([
      db.select().from(memories).limit(1),
      db.select().from(skills).limit(1),
      db.select().from(agents).limit(1),
    ]);
    
    memoryCount = memoriesResult.length;
    skillCount = skillsResult.length;
    agentCount = agentsResult.length;
  } catch {
    // Database not available
  }

  return c.json({
    ok: true,
    data: {
      version: '2.1.0',
      environment: env.NODE_ENV,
      llmConfigured: !!(env.NEXUS_LLM_BASE_URL && env.NEXUS_LLM_API_KEY && env.NEXUS_LLM_MODEL),
      embeddingsConfigured: !!(env.NEXUS_LLM_BASE_URL && env.NEXUS_LLM_API_KEY && env.NEXUS_EMBEDDING_MODEL),
      busBackend: env.NEXUS_BUS_BACKEND,
      entityCounts: {
        memories: memoryCount,
        skills: skillCount,
        agents: agentCount,
      },
    },
  });
});

export default router;
