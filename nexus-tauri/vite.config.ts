import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a relative base and self-contained assets.
export default defineConfig(async () => ({
  plugins: [react()],
  // Relative base so the bundled app works from the Tauri custom protocol.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    // Fail the build loudly on oversized chunks so lazy-loading stays effective.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendors into their own cacheable chunks.
        manualChunks: {
          react: ['react', 'react-dom'],
          tauri: ['@tauri-apps/api', '@tauri-apps/plugin-opener'],
        },
      },
    },
  },
  server: {
    // Honour the port the Tauri dev harness expects.
    strictPort: true,
    port: 1420,
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
}));
