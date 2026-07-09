/** Shared row type for the in-memory drizzle mock used by tests. */
export type Row = Record<string, unknown> & { id?: string };
