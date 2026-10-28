import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import base from './manifest.json';
import pkg from './package.json';

// One version, the package's: the store, Chrome's extensions page and the panel footer all show it.
const manifest = { ...base, version: pkg.version };

// Build identity for the panel footer. The timestamp can only come from the build itself, so it is
// stamped here and read by src/panel.ts; a dev-served panel gets neither and says "dev build".
const buildInfo = { version: pkg.version, builtAt: new Date().toISOString() };

// Builds the MV3 extension to dist/. crxjs wires the manifest's source entries
// (content/background/devtools) and rewrites paths; panel.html is an extra input
// because it's loaded at runtime by chrome.devtools.panels.create.
export default defineConfig({
  plugins: [svelte(), crx({ manifest })],
  define: { __RUNESPECT_BUILD__: JSON.stringify(buildInfo) },
  build: {
    rollupOptions: {
      input: { panel: 'panel.html' },
    },
  },
});
