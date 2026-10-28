import { defineConfig } from 'vitest/config';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { runespectPreprocess } from '@runespect/vite-plugin';
import { instrumentModule } from '@runespect/vite-plugin/internal';

export default defineConfig({
  plugins: [
    svelte({
      preprocess: [
        vitePreprocess(),
        runespectPreprocess({ enabled: true, include: /playground\/src\/.*\.svelte$/ }),
      ],
    }),
    svelteTesting(),
    // What runespect() does to .svelte.ts modules on the dev server, here for src/modules/ only.
    {
      name: 'runespect-modules',
      transform(code, id) {
        if (!/playground\/src\/modules\//.test(id)) return;
        return instrumentModule(code, id, (c) => this.parse(c));
      },
    },
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
