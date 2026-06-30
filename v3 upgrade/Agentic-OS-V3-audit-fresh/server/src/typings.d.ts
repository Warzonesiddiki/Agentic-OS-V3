declare module "screenshot-desktop" {
  interface ScreenshotOptions {
    format?: string;
    screen?: number;
  }
  function screenshot(opts?: ScreenshotOptions): Promise<Buffer>;
  export = screenshot;
}
