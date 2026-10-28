import { test, expect } from '@playwright/test';

// What a coding agent with a browser tool (Playwright MCP, Chrome DevTools MCP) does: evaluate
// window.__runespect in the page, read a component's values and change one.
test('a script in the page reads a component’s values and changes one', async ({ page }) => {
  await page.goto('/?case=console');
  await expect
    .poll(() => page.evaluate(() => window.__runespect?.find('Counter').length))
    .toBeGreaterThan(0);

  const { values, applied } = await page.evaluate(() => {
    const rs = window.__runespect!;
    const [counter] = rs.find('/^Counter$/');
    return { values: rs.values(counter.id), applied: rs.set(counter.id, 'count', 21) };
  });
  expect(values?.state).toEqual({ count: 1 });
  expect(applied).toBe(true);
  await expect(page.locator('#app button', { hasText: '21 / 42' }).first()).toBeVisible();
});
