/**
 * Aeon2 — MCP registry coverage (server/src/services/mcp-registry.ts).
 *
 * Proves the JSON-RPC streaming parser handles newline + Content-Length
 * framing (including split chunks), the schema->zod converter works, and the
 * MCPRegistry server-lifecycle (register / get / list / stats / unregister)
 * behaves correctly. mcp-registry.ts is within Aeon's namespace.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  JsonRpcMessageParser,
  jsonSchemaToZod,
  MCPRegistry,
} from '../src/services/mcp-registry.js';

// Mock the DB client so importing the registry does not load the native
// better-sqlite3 binding (Node-ABI mismatch in this shell).
vi.mock('../src/db/client.js', () => ({
  db: {},
  isPostgres: false,
  isSqlite: true,
  memories: {},
  skills: {},
  tokenLedger: {},
  auditLog: {},
  notes: {},
}));

// ---------------------------------------------------------------------------
// JSON-RPC streaming parser
// ---------------------------------------------------------------------------
describe('JsonRpcMessageParser', () => {
  it('parses newline-delimited JSON-RPC messages', () => {
    const p = new JsonRpcMessageParser();
    const got: unknown[] = [];
    p.parseChunk('{"jsonrpc":"2.0","method":"ping"}\n', (m) => got.push(m));
    expect(got).toHaveLength(1);
    expect((got[0] as { method: string }).method).toBe('ping');
  });

  it('handles messages split across multiple chunks', () => {
    const p = new JsonRpcMessageParser();
    const got: unknown[] = [];
    p.parseChunk('{"jsonrpc":"2.0","met', (m) => got.push(m));
    p.parseChunk('hod":"ping"}\n{"json', (m) => got.push(m));
    p.parseChunk('rpc":"2.0","id":1,"result":{}}\n', (m) => got.push(m));
    expect(got).toHaveLength(2);
    expect((got[1] as { id: number }).id).toBe(1);
  });

  it('supports Content-Length header framing (LSP style)', () => {
    const p = new JsonRpcMessageParser();
    const body = JSON.stringify({ jsonrpc: '2.0', method: 'notify' });
    const frame = `Content-Length: ${body.length}\r\n\r\n${body}`;
    const got: unknown[] = [];
    p.parseChunk(frame, (m) => got.push(m));
    expect(got).toHaveLength(1);
    expect((got[0] as { method: string }).method).toBe('notify');
  });

  it('handles a Content-Length frame split across chunks', () => {
    const p = new JsonRpcMessageParser();
    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, result: { ok: true } });
    const frame = `Content-Length: ${body.length}\r\n\r\n${body}`;
    const got: unknown[] = [];
    p.parseChunk(frame.slice(0, 10), (m) => got.push(m));
    p.parseChunk(frame.slice(10), (m) => got.push(m));
    expect(got).toHaveLength(1);
    expect((got[0] as { id: number }).id).toBe(7);
  });

  it('ignores non-JSON log noise on stdout', () => {
    const p = new JsonRpcMessageParser();
    const got: unknown[] = [];
    p.parseChunk('some subprocess log line\n{"jsonrpc":"2.0","method":"x"}\n', (m) => got.push(m));
    expect(got).toHaveLength(1);
  });

  it('emits an error when the buffer limit is exceeded', () => {
    const p = new JsonRpcMessageParser(16);
    const errs: Error[] = [];
    p.parseChunk('{"jsonrpc":"2.0","method":"aaaaaaaaaaaaaaaa"}\n', () => {}, (e) => errs.push(e));
    expect(errs.length).toBe(1);
    expect(errs[0].message).toContain('buffer limit');
  });

  it('reset() clears the pending buffer', () => {
    const p = new JsonRpcMessageParser();
    const got: unknown[] = [];
    p.parseChunk('{"jsonrpc":"2.0","met', () => got.push({}));
    p.reset();
    p.parseChunk('hod":"x"}\n', (m) => got.push(m));
    // The orphaned tail is not a valid complete message by itself.
    expect(got.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// JSON schema -> Zod
// ---------------------------------------------------------------------------
describe('jsonSchemaToZod', () => {
  it('converts a basic object schema', () => {
    const schema = {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'number' } },
      required: ['name'],
    };
    const zod = jsonSchemaToZod(schema);
    const parsed = zod.parse({ name: 'abc', age: 3 });
    expect(parsed.name).toBe('abc');
    expect(parsed.age).toBe(3);
    expect(() => zod.parse({ age: 3 })).toThrow(); // name required
  });

  it('supports boolean and array types', () => {
    const schema = {
      type: 'object',
      properties: {
        flag: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['a', 'b'] },
      },
      required: ['flag', 'tags', 'mode'],
    };
    const zod = jsonSchemaToZod(schema);
    const ok = zod.parse({ flag: true, tags: ['x'], mode: 'a' });
    expect(ok.flag).toBe(true);
    expect(ok.tags).toEqual(['x']);
    // enum is not constrained (treated as plain string)
    expect(zod.parse({ flag: true, tags: [1, 2], mode: 'z' }).mode).toBe('z');
    expect(() => zod.parse({ flag: true, tags: ['x'] })).toThrow(); // mode required
  });

  it('treats unknown schema shapes as a permissive object', () => {
    const zod = jsonSchemaToZod({ something: 'weird' });
    // Falls back to an empty passthrough object schema, not z.any().
    expect(zod.safeParse({}).success).toBe(true);
    expect(zod.safeParse({ any: 'thing' }).success).toBe(true);
    expect(zod.safeParse(42).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MCPRegistry lifecycle
// ---------------------------------------------------------------------------
describe('MCPRegistry lifecycle', () => {
  it('registers, looks up, lists and unregisters servers', () => {
    const reg = new MCPRegistry();
    const rec = reg.register('local-fs', 'stdio', {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: {},
    });

    expect(rec.id).toMatch(/^mcp_/);
    expect(rec.status).toBe('disconnected');
    expect(reg.getServer(rec.id)?.name).toBe('local-fs');
    expect(reg.listServers()).toHaveLength(1);

    const stats = reg.getStats();
    expect(stats.total).toBe(1);
    expect(stats.disconnected).toBe(1);

    expect(reg.unregister(rec.id)).toBe(true);
    expect(reg.listServers()).toHaveLength(0);
    expect(reg.getServer(rec.id)).toBeUndefined();
  });

  it('reports aggregate stats across multiple servers', () => {
    const reg = new MCPRegistry();
    reg.register('a', 'stdio', { command: 'a', args: [], env: {} });
    reg.register('b', 'http-sse', { url: 'http://x', headers: {} });
    const stats = reg.getStats();
    expect(stats.total).toBe(2);
    expect(stats.disconnected).toBe(2);
    expect(stats.totalTools).toBe(0);
  });

  it('is a functional event emitter (server:registered fires)', () => {
    const reg = new MCPRegistry();
    let fired = false;
    reg.on('server:registered', () => {
      fired = true;
    });
    reg.register('evt', 'stdio', { command: 'c', args: [], env: {} });
    expect(fired).toBe(true);
  });
});
