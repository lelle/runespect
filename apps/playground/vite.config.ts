import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespectPreprocess, runespect } from '@runespect/vite-plugin';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: [
        vitePreprocess(),
        runespectPreprocess({ include: /playground\/src\/.*\.svelte$/ }),
      ],
    }),
    // The agent, the panel window at /__runespect/, and module state. Dev only, except for the
    // build e2e/include-in-release.spec.ts drives.
    runespect({ includeInRelease: process.env.DEPLOY_ENV === 'test' }),
  ],
});
