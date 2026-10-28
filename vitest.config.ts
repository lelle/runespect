import { defineConfig } from 'vitest/config';

// Root config: aggregates the product packages' test suites into one run so coverage is unified.
// `pnpm test` (pnpm -r) stays the canonical per-package run; this powers `pnpm test:coverage`.
export default defineConfig({
  test: {
    projects: [
      'apps/playground',
      'packages/proxy',
      'packages/prod-reader',
      'apps/site',
      { test: { name: 'scripts', include: ['scripts/**/*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      // Components too: v8 maps them back to their source through vite-plugin-svelte's maps. An
      // index.ts that only re-exports has nothing to count; the plugin's own index.ts is the plugin.
      include: ['packages/*/src/**/*.{ts,svelte}'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/*.config.ts'],
    },
  },
});
