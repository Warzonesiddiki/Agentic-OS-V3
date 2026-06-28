declare module 'postgres' {
  import { Sql } from 'postgres';
  export default function postgres(options?: any): Sql;
  export { Sql };
}

declare module 'prom-client' {
  export class Counter<T extends string = string> {
    constructor(options: any);
    inc(labels?: Record<T, number | string>): void;
    inc(value: number, labels?: Record<T, number | string>): void;
  }
  export class Histogram<T extends string = string> {
    constructor(options: any);
    observe(value: number): void;
    startTimer(): () => number;
  }
  export class Gauge<T extends string = string> {
    constructor(options: any);
    set(value: number): void;
    inc(): void;
    dec(): void;
  }
  export const register: {
    metrics(): Promise<string>;
    clear(): void;
  };
  export function collectDefaultMetrics(): void;
}

declare module 'playwright' {
  export const chromium: any;
  export const firefox: any;
  export const webkit: any;
  export function launch(options?: any): any;
}

declare module 'viem' {
  export const createPublicClient: any;
  export const createWalletClient: any;
  export const http: any;
  export const custom: any;
  export const defineChain: any;
  export const formatEther: any;
  export const parseEther: any;
  export const encodeFunctionData: any;
  export const decodeFunctionData: any;
  export type Address = `0x${string}`;
  export type Hash = `0x${string}`;
  export type Hex = `0x${string}`;
}

declare module 'viem/accounts' {
  export const privateKeyToAccount: any;
}

declare module 'viem/chains' {
  export const mainnet: any;
  export const sepolia: any;
  export const polygon: any;
}

declare module '@opentelemetry/resources' {
  export class Resource {
    static EMPTY: Resource;
    constructor(attributes?: any);
    merge(other: Resource): Resource;
  }
}

declare module '@opentelemetry/semantic-conventions' {
  export const SEMRESATTRS_SERVICE_NAME: string;
  export const SEMATTRS_HTTP_METHOD: string;
  export const SEMATTRS_HTTP_URL: string;
  export const SEMATTRS_HTTP_STATUS_CODE: string;
}

declare module '@opentelemetry/sdk-trace-node' {
  export class NodeTracerProvider {
    constructor(config?: any);
    register(): void;
    shutdown(): Promise<void>;
  }
}

declare module '@opentelemetry/sdk-trace-base' {
  export class SimpleSpanProcessor {
    constructor(exporter: any);
  }
  export class BatchSpanProcessor {
    constructor(exporter: any, config?: any);
  }
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  export class OTLPTraceExporter {
    constructor(config?: any);
    export(spans: any, callback: any): void;
    shutdown(): Promise<void>;
  }
}

declare module '@opentelemetry/instrumentation-http' {
  export class HttpInstrumentation {
    constructor(config?: any);
  }
}

declare module '@opentelemetry/instrumentation' {
  export class InstrumentationBase {
    constructor(name: string, version: string, config?: any);
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
  }
  export interface InstrumentationConfig {
    enabled?: boolean;
  }
  export interface Instrumentation {
    instrumentationName: string;
    instrumentationVersion: string;
    enable(): void;
    disable(): void;
    setConfig(config?: any): void;
    getConfig(): any;
  }
}
