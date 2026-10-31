import { defineConfig, devices } from '@playwright/test';

// Drives the real plugin product path (vite-plugin preprocessor + broadcast +
// <Inspect> overlay) in a real browser. Uses Google Chrome (channel: 'chrome'), the browser most
// devtools users have: locally the installed one, in CI one `playwright install chrome` fetches. The playground dev server is started automatically, on its
// own port: Vite's default 5173 is where any other project's dev server sits, and reusing one of
// those fails every test without saying why.
const E2E_URL = 'http://localhost:5187';
const BASE_URL = 'http://localhost:5186/app/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: E2E_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter playground dev --port ${new URL(E2E_URL).port} --strictPort`,
      url: E2E_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    // The project site's demo, built as static files and served, for demo.spec.ts.
    {
      command: 'pnpm --filter demo build && pnpm --filter demo preview --strictPort',
      url: 'http://localhost:5182/runespect/demo/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The project site, built and served the way GitHub Pages serves it, for site.spec.ts.
    {
      command: 'pnpm --filter site build && node e2e/serve-site.ts 5183',
      url: 'http://localhost:5183/runespect/',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    // The playground and a SvelteKit app, built with includeInRelease, for include-in-release.spec.ts.
    {
      command:
        'DEPLOY_ENV=test pnpm --filter playground exec vite build && pnpm --filter playground exec vite preview --port 5193 --strictPort',
      url: 'http://localhost:5193/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        'DEPLOY_ENV=test pnpm --filter sveltekit-spa build && pnpm --filter sveltekit-spa preview --port 5194 --strictPort',
      url: 'http://localhost:5194/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // The same app under a base path, for agent-loading.spec.ts.
    {
      command: `pnpm --filter playground dev --port ${new URL(BASE_URL).port} --strictPort --base ${new URL(BASE_URL).pathname}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
