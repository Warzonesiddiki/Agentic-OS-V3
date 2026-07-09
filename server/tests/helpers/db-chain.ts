// Reusable chainable Drizzle-style db mock for unit tests.
// Supports the query-builder shapes used across the memory service modules:
// insert().values().returning(), select().from().where().limit()/.orderBy(),
// update().set().where().returning(), delete().where(), .execute(), and
// db.transaction(fn) / db.withTransaction(fn) (passes a fresh tx builder).
//
// Usage:
//   import { buildClientMock } from '../../tests/helpers/db-chain.js';
//   const store = { selectResult: [] , backend: 'sqlite' };
//   vi.mock('../src/db/client.js', () => buildClientMock(store));
//
// `selectResult` is what select/await-builder resolves to. `backend` controls
// getBackend(). Tests may read `store.calls` for fine-grained assertions.

export interface ChainStore {
  selectResult?: any[];
  backend?: string;
  calls?: any[];
}

export function buildClientMock(store: ChainStore = {}) {
  const calls: any[] = (store.calls = store.calls ?? []);
  // NOTE: selectResult is read dynamically (at resolution time) so tests can
  // mutate store.selectResult in beforeEach and have it take effect.

  const makeBuilder = (): any => {
    let lastValues: any;
    let lastPatch: any;
    const self: any = {};
    const resolve = (v: any) => Promise.resolve(v);

    self.select = () => {
      calls.push({ op: 'select' });
      return self;
    };
    self.from = () => self;
    self.where = () => self;
    self.orderBy = () => self;
    self.insert = (t: any) => {
      calls.push({ op: 'insert', table: t });
      return self;
    };
    self.values = (v: any) => {
      lastValues = v;
      return self;
    };
    self.update = (t: any) => {
      calls.push({ op: 'update', table: t });
      return self;
    };
    self.set = (p: any) => {
      lastPatch = p;
      return self;
    };
    self.delete = (t: any) => {
      calls.push({ op: 'delete', table: t });
      return self;
    };
    self.returning = () => resolve([lastValues ?? lastPatch ?? {}]);
    self.execute = () => resolve([]);
    self.limit = () => resolve(store.selectResult ?? []);
    // thenable so `await tx.select().from(...)` resolves to selectResult
    self.then = (res: any) => resolve(store.selectResult ?? []).then(res);
    self.catch = (rej: any) => resolve(store.selectResult ?? []).catch(rej);
    return self;
  };

  const db: any = {
    select: () => makeBuilder(),
    insert: (t: any) => {
      const b = makeBuilder();
      return b.insert(t);
    },
    update: (t: any) => {
      const b = makeBuilder();
      return b.update(t);
    },
    delete: (t: any) => {
      const b = makeBuilder();
      return b.delete(t);
    },
    transaction: async (fn: any) => fn(makeBuilder()),
    withTransaction: async (fn: any) => fn(makeBuilder()),
  };

  return {
    db,
    getBackend: () => store.backend ?? 'sqlite',
    memories: {},
    memoryAttachments: {},
    memoryTags: {},
    tagTaxonomy: {},
    memoryClusters: {},
    memoryClusterMembers: {},
  };
}
