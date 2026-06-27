/**
 * hono-env.ts — shared request-context variable typing so c.set/c.get are
 * type-safe under strict TypeScript (Hono requires an explicit Variables map).
 */
import type { HttpBindings } from "@hono/node-server";
import type { Principal } from "./security.js";

export type NexusEnv = {
  Variables: {
    requestId: string;
    principal: Principal | null;
  };
  Bindings: HttpBindings;
};
