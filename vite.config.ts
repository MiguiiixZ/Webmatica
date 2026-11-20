import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

/** Short commit of this build: Cloudflare Pages provides CF_PAGES_COMMIT_SHA; locally ask git. */
function buildId(): string {
  const cf = process.env.CF_PAGES_COMMIT_SHA;
  if (cf) return cf.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
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
