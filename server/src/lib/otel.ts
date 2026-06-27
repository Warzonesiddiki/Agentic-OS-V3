/**
 * otel.ts — OpenTelemetry integration for NEXUS.
 * Provides tracing and context propagation.
 * Configured via env vars — disabled by default.
 */

import { getEnv } from "./env.js";
import { log } from "./logging.js";

let _initialized = false;

export function isOtelEnabled(): boolean {
  return Boolean(getEnv().NEXUS_OTEL_ENDPOINT);
}

export async function initOtel(): Promise<void> {
  if (_initialized) return;
  if (!isOtelEnabled()) return;

  try {
    const resources = await import("@opentelemetry/resources");
    const semantic = await import("@opentelemetry/semantic-conventions");
    const traceNode = await import("@opentelemetry/sdk-trace-node");
    const traceBase = await import("@opentelemetry/sdk-trace-base");
    const traceHttp = await import("@opentelemetry/exporter-trace-otlp-http");
    const instrHttp = await import("@opentelemetry/instrumentation-http");
    const instr = await import("@opentelemetry/instrumentation");

    const env = getEnv();
    const resource = resources.resourceFromAttributes({
      [semantic.SemanticResourceAttributes.SERVICE_NAME]: "nexus-server",
      [semantic.SemanticResourceAttributes.SERVICE_VERSION]: "2.0.0",
      [semantic.SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new (traceNode as any).NodeTracerProvider({ resource });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exporter = new (traceHttp as any).OTLPTraceExporter({
      url: env.NEXUS_OTEL_ENDPOINT,
      headers: env.NEXUS_OTEL_API_KEY
        ? { Authorization: `Bearer ${env.NEXUS_OTEL_API_KEY}` }
        : undefined,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider.addSpanProcessor(new (traceBase as any).SimpleSpanProcessor(exporter));
    provider.register();

    instr.registerInstrumentations({
      instrumentations: [new (instrHttp as any).HttpInstrumentation()],
    });

    _initialized = true;
    log.info("otel_initialized", { endpoint: env.NEXUS_OTEL_ENDPOINT });
  } catch (e) {
    log.warn("otel_init_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
