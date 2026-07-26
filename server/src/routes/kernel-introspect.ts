import { Hono } from 'hono';
import type { Context } from 'hono';
import type { NexusEnv } from '../lib/hono-env.js';
import { ok } from '../lib/envelope.js';
import { getKernelIntrospection } from '../services/kernel-introspect-state.js';

export const kernelIntrospectRouter = new Hono<NexusEnv>();
type KernelContext = Context<NexusEnv>;
const requestId = (c: KernelContext): string => c.get('requestId') ?? '';
function snapshot(c: KernelContext): Response { return c.json(ok(getKernelIntrospection(), requestId(c))); }
function rings(c: KernelContext): Response { return c.json(ok(getKernelIntrospection().rings, requestId(c))); }
function resources(c: KernelContext): Response { return c.json(ok(getKernelIntrospection().resources, requestId(c))); }
function gangs(c: KernelContext): Response { return c.json(ok(getKernelIntrospection().gangs, requestId(c))); }
function health(c: KernelContext): Response { return c.json(ok(getKernelIntrospection().health, requestId(c))); }
kernelIntrospectRouter.get('/', snapshot);
kernelIntrospectRouter.get('/api/kernel/introspect', snapshot);
kernelIntrospectRouter.get('/rings', rings);
kernelIntrospectRouter.get('/api/kernel/introspect/rings', rings);
kernelIntrospectRouter.get('/resources', resources);
kernelIntrospectRouter.get('/api/kernel/introspect/resources', resources);
kernelIntrospectRouter.get('/gangs', gangs);
kernelIntrospectRouter.get('/api/kernel/introspect/gangs', gangs);
kernelIntrospectRouter.get('/health', health);
kernelIntrospectRouter.get('/api/kernel/introspect/health', health);
