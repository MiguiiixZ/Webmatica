import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';

/** Publishes the LICENSES file as /LICENSES.txt so the app can link to it. */
function licenses(): Plugin {
  return {
    name: 'webmatica-licenses',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'LICENSES.txt', source: readFileSync('LICENSES', 'utf8') });
    },
  };
}

// Cross-origin isolation lets workers share block data through SharedArrayBuffer
// instead of copying it. The same headers are set for production in public/_headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: '/',
  plugins: [preact(), licenses()],
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
