import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// Builds the standalone panel to ../panel-dist, which the plugin serves as static files. Built
// separately from the host app on purpose: the app's own Svelte config (including runespect's own
// instrumentation) must not compile the devtools.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte()],
  build: {
    outDir: '../panel-dist',
    emptyOutDir: true,
  },
  base: './',
});
