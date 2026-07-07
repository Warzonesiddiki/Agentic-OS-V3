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
    // Only check Content-Length if present
    const contentLengthHeader = c.req.header('content-length');
    if (!contentLengthHeader) {
      return await next();
    }
    
    const contentLength = parseInt(contentLengthHeader || '0', 10);
    
    if (isNaN(contentLength) || contentLength <= 0) {
      return await next();
    }
    
    if (contentLength > limit) {
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
    
    return await next();
  };
}
