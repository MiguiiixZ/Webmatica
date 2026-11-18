import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Cross-origin isolation lets workers share block data through SharedArrayBuffer
// instead of copying it. The same headers are set for production in public/_headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: '/',
  plugins: [preact()],
  worker: { format: 'es' },
  build: {
    target: ['es2022', 'safari16'],
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
