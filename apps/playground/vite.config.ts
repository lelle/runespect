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
    runespect(), // dev only: the agent, the panel window at /__runespect/, and module state
  ],
});
