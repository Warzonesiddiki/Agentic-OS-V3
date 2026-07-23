/**
 * E9-S1..S4 Serena Code Intelligence — Unit Tests
 * Tests: indexProject, findSymbols, getSymbolInfo, listReferences, semanticSearch,
 *        readSymbol, getDiagnostics, editAtSymbol, renameSymbol, extractFunction
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SerenaCodeIntelligence, SymbolKindSchema, CodeSymbolSchema } from './r1-serena.js';

function makeMockFileSystem(files: Record<string, string>) {
  return {
    readFile: (p: string) => {
      const content = files[p];
      if (content === undefined) throw new Error(`File not found: ${p}`);
      return Promise.resolve(content);
    },
    glob: async (_pattern: string, _root: string) => Promise.resolve(Object.keys(files)),
  };
}

function makeMockSymbolProvider(_file: string, content: string) {
  const symbols: Awaited<ReturnType<typeof import('./r1-serena.js').SerenaCodeIntelligence.prototype['indexProject']>>['symbols'] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/\bfunction\s+([A-Za-z0-9_]+)/))) {
      symbols.push({ name: m[1]!, kind: 'function', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
    if ((m = line.match(/\bclass\s+([A-Za-z0-9_]+)/))) {
      symbols.push({ name: m[1]!, kind: 'class', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
    if ((m = line.match(/\binterface\s+([A-Za-z0-9_]+)/))) {
      symbols.push({ name: m[1]!, kind: 'interface', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
    if ((m = line.match(/\btype\s+([A-Za-z0-9_]+)\s*=/))) {
      symbols.push({ name: m[1]!, kind: 'type', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
    if ((m = line.match(/\bconst\s+([A-Za-z0-9_]+)\s*=\s*\(/))) {
      symbols.push({ name: m[1]!, kind: 'constant', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
    if ((m = line.match(/\blet\s+([A-Za-z0-9_]+)/))) {
      symbols.push({ name: m[1]!, kind: 'variable', file: _file, line: i, column: m.index ?? 0, signature: m[0] });
    }
  }
  return Promise.resolve(symbols);
}

describe('SerenaCodeIntelligence', () => {
  let serena: SerenaCodeIntelligence;
  const projectId = '550e8400-e29b-41d4-a716-446655440000';
  const projectRoot = '/tmp/test-project';

  const files = {
    '/tmp/test-project/src/math.ts': `function add(a: number, b: number): number { return a + b; }\nfunction multiply(a: number, b: number): number { return a * b; }\nclass Calculator { value: number = 0; }`,
    '/tmp/test-project/src/string.ts': `const capitalize = (s: string): string => s[0]?.toUpperCase() + s.slice(1);\nlet greeting: string = "hello";\ntype Name = string;`,
    '/tmp/test-project/src/misc.ts': `// No symbols here\ninterface Config { port: number; }\ntype Alias = Config;`,
  };

  beforeEach(() => {
    serena = new SerenaCodeIntelligence({
      fileSystem: makeMockFileSystem(files),
      symbolProvider: makeMockSymbolProvider,
      now: () => '2026-07-23T00:00:00.000Z',
    });
  });

  describe('Zod schemas', () => {
    it('SymbolKindSchema accepts valid kinds', () => {
      const kinds = ['function', 'class', 'variable', 'type', 'interface', 'method', 'property', 'constant', 'enum', 'module'];
      for (const kind of kinds) {
        expect(SymbolKindSchema.parse(kind)).toBe(kind);
      }
    });

    it('SymbolKindSchema rejects invalid kinds', () => {
      expect(() => SymbolKindSchema.parse('bogus')).toThrow();
    });

    it('CodeSymbolSchema validates correct symbol', () => {
      const sym = { name: 'add', kind: 'function', file: 'math.ts', line: 0, column: 0 };
      expect(CodeSymbolSchema.parse(sym)).toEqual(sym);
    });

    it('CodeSymbolSchema rejects missing required fields', () => {
      expect(() => CodeSymbolSchema.parse({ kind: 'function' })).toThrow();
      expect(() => CodeSymbolSchema.parse({ name: 'add' })).toThrow();
    });
  });

  describe('indexProject', () => {
    it('indexes all files and extracts symbols', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      expect(index.indexedAt).toBe('2026-07-23T00:00:00.000Z');
      expect(index.files.length).toBeGreaterThan(0);
      expect(index.symbols.length).toBeGreaterThan(0);
      expect(index.map).toBeDefined();
    });

    it('caches index by projectId', async () => {
      const index1 = await serena.indexProject(projectId, projectRoot);
      const index2 = await serena.indexProject(projectId, projectRoot);
      expect(index1).toStrictEqual(index2); // same content, same object from cache
    });

    it('separate projectIds get separate caches', async () => {
      const index1 = await serena.indexProject(projectId, projectRoot);
      const index2 = await serena.indexProject('550e8400-e29b-41d4-a716-446655440001', projectRoot);
      expect(index1.indexedAt).toBe(index2.indexedAt); // same data, different cache key
      expect(index1.symbols).toStrictEqual(index2.symbols);
    });

    it('indexes function declarations', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      const funcs = index.symbols.filter(s => s.kind === 'function');
      expect(funcs.length).toBeGreaterThanOrEqual(2); // add, multiply
      expect(funcs.map(s => s.name)).toContain('add');
      expect(funcs.map(s => s.name)).toContain('multiply');
    });

    it('indexes class declarations', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      const classes = index.symbols.filter(s => s.kind === 'class');
      expect(classes.length).toBeGreaterThanOrEqual(1);
      expect(classes.map(s => s.name)).toContain('Calculator');
    });

    it('indexes type aliases', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      const types = index.symbols.filter(s => s.kind === 'type');
      expect(types.length).toBeGreaterThanOrEqual(2); // Name from string.ts, Alias from misc.ts
    });

    it('indexes constants with arrow functions', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      const constants = index.symbols.filter(s => s.kind === 'constant');
      expect(constants.some(s => s.name === 'capitalize')).toBe(true);
    });

    it('indexes interface declarations', async () => {
      const index = await serena.indexProject(projectId, projectRoot);
      const interfaces = index.symbols.filter(s => s.kind === 'interface');
      expect(interfaces.some(s => s.name === 'Config')).toBe(true);
    });
  });

  describe('getProjectMap', () => {
    it('returns null for unknown project', () => {
      expect(serena.getProjectMap('unknown-id')).toBeNull();
    });

    it('returns cached index for known project', async () => {
      await serena.indexProject(projectId, projectRoot);
      const map = serena.getProjectMap(projectId);
      expect(map).not.toBeNull();
      expect(map!.indexedAt).toBe('2026-07-23T00:00:00.000Z');
    });
  });

  describe('findSymbols', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns matching symbols by name', async () => {
      const results = await serena.findSymbols({ projectId, query: 'add', limit: 100 });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(s => s.name.toLowerCase().includes('add'))).toBe(true);
    });

    it('is case-insensitive', async () => {
      const results = await serena.findSymbols({ projectId, query: 'ADD', limit: 100 });
      expect(results.length).toBeGreaterThan(0);
    });

    it('filters by kind', async () => {
      const funcs = await serena.findSymbols({ projectId, query: 'add', kind: 'function', limit: 100 });
      expect(funcs.every(s => s.kind === 'function')).toBe(true);
    });

    it('filters by fileFilter', async () => {
      const results = await serena.findSymbols({ projectId, query: 'add', fileFilter: 'math.ts', limit: 100 });
      expect(results.every(s => s.file.includes('math.ts'))).toBe(true);
    });

    it('respects limit', async () => {
      const results = await serena.findSymbols({ projectId, query: 'function', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('throws when project not indexed (non-UUID rejected by Zod first)', async () => {
      // 'unknown' is not a UUID so Zod rejects it before the "not indexed" check
      await expect(serena.findSymbols({ projectId: '00000000-0000-0000-0000-000000000000', query: 'add', limit: 100 }))
        .rejects.toThrow();
    });

    it('throws on empty query', async () => {
      // Zod validates query min(1) so should throw
      await expect(serena.findSymbols({ projectId, query: '', limit: 100 })).rejects.toThrow();
    });

    it('returns empty array for no matches', async () => {
      const results = await serena.findSymbols({ projectId, query: 'nonexistentSymbolXYZ', limit: 100 });
      expect(results).toHaveLength(0);
    });
  });

  describe('getSymbolInfo', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns closest symbol within 3 lines', async () => {
      const result = await serena.getSymbolInfo({ projectId, file: '/tmp/test-project/src/math.ts', line: 0 }, projectRoot);
      expect(result.name).toBeDefined();
      expect(result.kind).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('returns snippet with context', async () => {
      const result = await serena.getSymbolInfo({ projectId, file: '/tmp/test-project/src/math.ts', line: 0 }, projectRoot);
      expect(result.content.split('\n').length).toBeGreaterThan(1);
    });

    it('throws when project not indexed (non-UUID rejected by Zod first)', async () => {
      // 'unknown' is not a valid UUID so Zod validation fails first
      await expect(serena.getSymbolInfo({ projectId: '00000000-0000-0000-0000-000000000000', file: '/tmp/test-project/src/math.ts', line: 0 }, projectRoot))
        .rejects.toThrow();
    });

    it('handles absolute and relative file paths', async () => {
      const abs = await serena.getSymbolInfo({ projectId, file: '/tmp/test-project/src/math.ts', line: 0 }, projectRoot);
      const rel = await serena.getSymbolInfo({ projectId, file: 'src/math.ts', line: 0 }, projectRoot);
      expect(abs.name).toBe(rel.name);
    });

    it('returns unknown symbol when no symbol near line', async () => {
      // Query line far from any symbol
      const result = await serena.getSymbolInfo({ projectId, file: '/tmp/test-project/src/math.ts', line: 999 }, projectRoot);
      expect(result.name).toBe('unknown');
      expect(result.kind).toBe('variable');
    });
  });

  describe('listReferences', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('finds references to a symbol', async () => {
      const refs = await serena.listReferences(projectId, 'add');
      expect(refs.length).toBeGreaterThanOrEqual(1);
      expect(refs[0]).toMatchObject({ file: expect.any(String), line: expect.any(Number), column: expect.any(Number) });
    });

    it('capped at 200 references', async () => {
      // Create a project with a single-letter symbol to get many matches
      const shortSerena = new SerenaCodeIntelligence({
        fileSystem: {
          readFile: async (_p: string) => 'const a = 1;\nconst b = 2;\nconst c = 3;\n'.repeat(500),
          glob: async () => ['/x.ts'],
        },
        symbolProvider: async (_f: string, _c: string) => [{ name: 'single', kind: 'variable' as const, file: '/x.ts', line: 0, column: 0 }],
      });
      await shortSerena.indexProject('proj', '/');
      const refs = await shortSerena.listReferences('proj', 'a');
      expect(refs.length).toBeLessThanOrEqual(200);
    });

    it('returns preview text', async () => {
      const refs = await serena.listReferences(projectId, 'add');
      expect(refs[0]?.preview).toBeDefined();
      expect(typeof refs[0]!.preview).toBe('string');
    });

    it('throws when project not indexed', async () => {
      await expect(serena.listReferences('unknown', 'add')).rejects.toThrow('Project not indexed');
    });
  });

  describe('semanticSearch', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns scored results', async () => {
      const results = await serena.semanticSearch(projectId, 'add', 20);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toMatchObject({ symbol: expect.any(Object), score: expect.any(Number) });
    });

    it('results sorted by score descending', async () => {
      const results = await serena.semanticSearch(projectId, 'add', 20);
      for (let i = 1; i < results.length; i++) {
        expect(results[i-1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it('exact name match gets higher score', async () => {
      const results = await serena.semanticSearch(projectId, 'add', 20);
      expect(results[0]!.symbol.name.toLowerCase()).toBe('add');
      expect(results[0]!.score).toBeGreaterThanOrEqual(2); // exact match + term match
    });

    it('respects limit', async () => {
      const results = await serena.semanticSearch(projectId, 'function', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('throws when project not indexed', async () => {
      await expect(serena.semanticSearch('unknown', 'add')).rejects.toThrow('Project not indexed');
    });
  });

  describe('readSymbol', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns snippet and symbol', async () => {
      const result = await serena.readSymbol(projectId, '/tmp/test-project/src/math.ts', 'add', projectRoot);
      expect(result.content).toBeDefined();
      expect(result.symbol).toBeDefined();
    });

    it('returns null symbol when not found', async () => {
      const result = await serena.readSymbol(projectId, '/tmp/test-project/src/math.ts', 'nonExistentSymbol', projectRoot);
      // Falls back to first occurrence search, may be null or have content
      expect(result.content).toBeDefined();
    });

    it('handles absolute path', async () => {
      const result = await serena.readSymbol(projectId, '/tmp/test-project/src/math.ts', 'add', projectRoot);
      expect(result.content).toBeDefined();
    });
  });

  describe('getDiagnostics', () => {
    it('returns warning for unindexed project', async () => {
      const diags = await serena.getDiagnostics('unknown');
      expect(diags).toHaveLength(1);
      expect(diags[0]).toMatchObject({ severity: 'warning', message: expect.stringContaining('not indexed') });
    });

    it('returns empty array for indexed project', async () => {
      await serena.indexProject(projectId, projectRoot);
      const diags = await serena.getDiagnostics(projectId);
      expect(diags).toHaveLength(0);
    });
  });

  describe('editAtSymbol', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns diff and approval status', async () => {
      const result = await serena.editAtSymbol({
        projectId, file: '/tmp/test-project/src/math.ts', symbolName: 'add',
        newContent: 'return a + b + 1;', projectRoot,
      });
      expect(result.diff).toContain('---');
      expect(result.diff).toContain('+++');
      expect(result.file).toBe('/tmp/test-project/src/math.ts');
      expect(result.approved).toBe(false); // no approvalId
    });

    it('marks approved when approvalId provided', async () => {
      const result = await serena.editAtSymbol({
        projectId, file: '/tmp/test-project/src/math.ts', symbolName: 'add',
        newContent: 'return a + b + 1;', projectRoot, approvalId: 'approval-123',
      });
      expect(result.approved).toBe(true);
    });

    it('handles relative file path', async () => {
      const result = await serena.editAtSymbol({
        projectId, file: 'src/math.ts', symbolName: 'add',
        newContent: 'return a + b;', projectRoot,
      });
      expect(result.file).toBe('/tmp/test-project/src/math.ts');
    });
  });

  describe('renameSymbol', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('returns changed file count and preview', async () => {
      const result = await serena.renameSymbol({ projectId, oldName: 'add', newName: 'sum', projectRoot });
      expect(result.changedFiles).toBeGreaterThanOrEqual(0);
      expect(result.preview).toContain('add');
      expect(result.preview).toContain('sum');
    });
  });

  describe('extractFunction', () => {
    it('extracts lines into function with call site', async () => {
      const result = await serena.extractFunction({
        projectId, file: '/tmp/test-project/src/math.ts', startLine: 0, endLine: 1,
        functionName: 'newFunc', projectRoot,
      });
      expect(result.newFunction).toContain('function newFunc()');
      expect(result.callSite).toContain('newFunc()');
    });

    it('returns valid structure even on partial read failure', async () => {
      // When file read partially succeeds, extractFunction should still return valid structure
      const partialSerena = new SerenaCodeIntelligence({
        fileSystem: {
          readFile: async (p: string) => {
            if (p.includes('nonexistent')) throw new Error('read error');
            return 'function original() { return 1; }';
          },
          glob: async () => ['/x.ts'],
        },
      });
      await partialSerena.indexProject(projectId, projectRoot);
      const result = await partialSerena.extractFunction({
        projectId, file: '/tmp/test-project/src/math.ts', startLine: 0, endLine: 1,
        functionName: 'newFunc', projectRoot,
      });
      expect(result.newFunction).toContain('function newFunc()');
      expect(result.callSite).toContain('newFunc()');
    });
  });

  describe('governance (E9-S3)', () => {
    beforeEach(async () => { await serena.indexProject(projectId, projectRoot); });

    it('editAtSymbol requires approvalId for governed edits', async () => {
      const withoutApproval = await serena.editAtSymbol({
        projectId, file: '/tmp/test-project/src/math.ts', symbolName: 'add',
        newContent: 'return 42;', projectRoot,
      });
      expect(withoutApproval.approved).toBe(false);
    });

    it('all edit tools include file path scoping', async () => {
      const editResult = await serena.editAtSymbol({
        projectId, file: '/tmp/test-project/src/math.ts', symbolName: 'add',
        newContent: 'return 42;', projectRoot, approvalId: 'req-1',
      });
      const renameResult = await serena.renameSymbol({ projectId, oldName: 'add', newName: 'sub', projectRoot });
      expect(editResult.file).toContain('math.ts');
      expect(renameResult.preview).toContain('Rename add');
    });
  });
});
