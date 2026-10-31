import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __runespect_tier0?: boolean;
  }
}

// How the plugin loads the agent into the app, with the playground served under `base: '/app/'`
// on its own dev server: the script tag and the panel window resolve against the base.
const BASE_URL = 'http://localhost:5186/app/';

test('under a base path, the agent loads and the panel window gets the tree with its values', async ({
  context,
}) => {
  const app = await context.newPage();
  await app.goto(`${BASE_URL}?case=base`);
  await expect.poll(() => app.evaluate(() => window.__runespect_tier0 === true)).toBe(true);

  const panel = await context.newPage();
  await panel.goto(`${BASE_URL}__runespect/?source=${encodeURIComponent('/app/?case=base')}`);
  await panel.locator('[data-select="Counter"]').first().click();
  await expect(panel.locator('[data-detail-edit="Counter.count"]').first()).toHaveValue('1');
  await expect(panel.locator('[data-testid="runespect-status"]')).toHaveText('Live');
});
