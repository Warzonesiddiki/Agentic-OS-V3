/**
 * otel.ts — OpenTelemetry integration for NEXUS.
 * Provides tracing and context propagation.
 * Configured via env vars — disabled by default.
 */

import { getEnv } from "./env.js";
import { log } from "./logging.js";

let _initialized = false;
// Provider type is dynamic via OTel SDK imports — we only call .shutdown() on it.
interface OtelProvider { shutdown(): Promise<void> }
let _provider: OtelProvider | null = null;

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

    // OTel SDKs ship without TS declarations for every class — cast through Record
    // to avoid eslint noise while preserving runtime correctness.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const provider = new (traceNode as Record<string, any>).NodeTracerProvider({ resource });
    const exporter = new (traceHttp as Record<string, any>).OTLPTraceExporter({
      url: env.NEXUS_OTEL_ENDPOINT,
      headers: env.NEXUS_OTEL_API_KEY
        ? { Authorization: `Bearer ${env.NEXUS_OTEL_API_KEY}` }
        : undefined,
    });

    provider.addSpanProcessor(new (traceBase as Record<string, any>).SimpleSpanProcessor(exporter));
    provider.register();

    instr.registerInstrumentations({
      instrumentations: [new (instrHttp as Record<string, any>).HttpInstrumentation()],
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    _provider = provider;
    _initialized = true;
    log.info("otel_initialized", { endpoint: env.NEXUS_OTEL_ENDPOINT });
  } catch (e) {
    log.warn("otel_init_failed", { error: e instanceof Error ? e.message : String(e) });
    _provider = null;
  }
}

/**
 * Gracefully shut down OpenTelemetry — flush pending spans and close exporters.
 * Safe to call even if OTEL was never initialized.
 */
export async function shutdownOtel(): Promise<void> {
  if (!_initialized || !_provider) return;
  try {
    if (typeof _provider.shutdown === "function") {
      await _provider.shutdown();
    }
    _initialized = false;
    _provider = null;
    log.info("otel_shutdown");
  } catch (e) {
    log.warn("otel_shutdown_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}
