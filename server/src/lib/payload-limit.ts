import type { Context } from "hono";
import { env } from "./env.js";

/**
 * Create payload limit middleware Hono.
 * @param maxBytes Maximum payload size in bytes (default from env)
 * @returns Hono middleware function
 */
export function createPayloadLimitMiddleware(maxBytes?: number) {
  const limit = maxBytes ?? (Number(env.NEXUS_MAX_BODY_BYTES) || 5 * 1024 * 1024); // 5MB default
  
  return async function payloadLimit(c: Context, next: () => Promise<void>): Promise<Response | void> {
    const reader = c.req.raw.clone().body?.getReader();
    if (reader) {
      let bytesRead = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.length;
          if (bytesRead > limit) {
            await reader.cancel();
            return c.json(
              {
                ok: false,
                error: {
                  code: 'PAYLOAD_TOO_LARGE',
                  message: `Payload too large. Maximum size allowed is ${limit} bytes.`,
                },
              },
              413
            );
          }
        }
      } catch {
        // ignore
      }
    }
    return await next();
  };
}
