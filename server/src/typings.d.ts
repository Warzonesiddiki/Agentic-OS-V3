declare module "js-yaml" {
  export function load(input: string, options?: Record<string, unknown>): unknown;
  export function dump(input: unknown, options?: Record<string, unknown>): string;
  export function safeLoad(input: string, options?: Record<string, unknown>): unknown;
  export function safeDump(input: unknown, options?: Record<string, unknown>): string;
  export const FAILSAFE_SCHEMA: unknown;
  export const JSON_SCHEMA: unknown;
  export const CORE_SCHEMA: unknown;
  export const DEFAULT_SCHEMA: unknown;
}

declare module "screenshot-desktop" {
  interface ScreenshotOptions {
    format?: string;
    screen?: number;
  }
  function screenshot(opts?: ScreenshotOptions): Promise<Buffer>;
  export = screenshot;
}
