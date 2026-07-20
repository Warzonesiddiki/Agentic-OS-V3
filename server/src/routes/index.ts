/**
 * routes/index.ts — Root route (serves frontend in production)
 */

import { Hono } from 'hono';
import { getEnv } from '../lib/env.js';

const router = new Hono();

router.get('/', async (c) => {
  const env = getEnv();
  
  // In production, serve the built frontend
  if (env.NODE_ENV === 'production') {
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    
    try {
      const indexPath = join(process.cwd(), 'dist', 'index.html');
      const html = await readFile(indexPath, 'utf-8');
      return c.html(html);
    } catch {
      // Frontend not built, serve API info
    }
  }
  
  // Development mode: serve API info
  return c.json({
    name: 'NEXUS 2.0 Agentic OS',
    version: '2.1.0',
    description: 'Universal AI Agent Operating System',
    docs: '/api/v1/health',
    metrics: '/api/v1/metrics',
  });
});

export default router;
