import { test, expect } from '@playwright/test';
import { ROW_HEIGHT } from '../packages/ui/src/virtual';

// Coverage for <Panel> — the extension's devtools view. It normally runs in the DevTools
// context, which Playwright can't drive, so /panel.html mounts it beside the instrumented app and
// wires it up over the same window.postMessage transport the extension relays. That makes this the
// real bridge (agent → transport → panel → agent), not a mock.

const viewport = '[data-testid="runespect-tree-viewport"]';
const rows = '[data-component]';

test('the panel renders the page tree it receives over the transport', async ({ page }) => {
  await page.goto('/panel.html');
  await expect(page.locator('[data-select="Counter"]').first()).toBeVisible();
  await expect(page.locator('[data-select="Showcase"]').first()).toBeVisible();
});

test('selecting a node shows its reactive values in the detail pane', async ({ page }) => {
  await page.goto('/panel.html');
  await page.locator('[data-select="Counter"]').first().click();
  // $state is editable (an input), $derived is read-only — the detail pane splits them by kind.
  await expect(page.locator('[data-detail-edit="Counter.count"]').first()).toBeVisible();
  await expect(page.locator('[data-detail-value="Counter.doubled"]').first()).toBeVisible();
});

test('editing a value in the panel flows back into the app', async ({ page }) => {
  await page.goto('/panel.html');
  await page.locator('[data-select="Counter"]').first().click();
  const edit = page.locator('[data-detail-edit="Counter.count"]').first();
  await edit.fill('42');
  await edit.dispatchEvent('input');
  await expect(page.locator('#app button', { hasText: '42 / 84' }).first()).toBeVisible();
});

test('search filters the tree and counts the matches', async ({ page }) => {
  await page.goto('/panel.html');
  await page.locator('[data-testid="runespect-search"]').fill('Counter');
  await expect(page.locator('[data-testid="runespect-search-count"]')).toHaveText('1 of 3');
  await expect(page.locator('[data-select="Card"]')).toHaveCount(0);
});

test('a large tree is virtualized: few rows in the DOM, full-height scrollbar', async ({
  page,
}) => {
  await page.goto('/panel.html?rows=300');
  await expect(page.locator(rows).first()).toBeVisible();

  // The harness root, 300 Counters, and the "Modules" node with the modules the page imports.
  const total = await page.evaluate(
    () => (window as unknown as { __runespect: { tree(): unknown[] } }).__runespect.tree().length,
  );
  expect(total).toBeGreaterThan(301);
  const metrics = await page.locator(viewport).evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(metrics.clientHeight).toBeGreaterThan(0);
  expect(metrics.scrollHeight).toBe(total * ROW_HEIGHT);
  expect(await page.locator(rows).count()).toBeLessThan(total / 3);
});

test('scrolling a large tree swaps in the rows at the new offset', async ({ page }) => {
  await page.goto('/panel.html?rows=300');
  await expect(page.locator(rows).first()).toBeVisible();

  await page.locator(viewport).evaluate((el, h) => (el.scrollTop = 200 * h), ROW_HEIGHT);
  await expect(page.locator('.rs-pad-top')).not.toHaveCSS('height', '0px');
  expect(await page.locator(rows).count()).toBeLessThan(100);
});

test('End jumps to the last row and scrolls it into view', async ({ page }) => {
  await page.goto('/panel.html?rows=300');
  await page.locator('[role="tree"]').focus();
  await page.keyboard.press('End');

  const selected = page.locator('.rs-selected');
  await expect(selected).toBeVisible();
  const scrolled = await page.locator(viewport).evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(0);
});

// Focus stays on the tree, not on a clicked row's button: once End moves the selection out of the
// rendered window that button is destroyed, and focus on it would fall to <body>.
test('keyboard navigation keeps working after the selection leaves the rendered rows', async ({
  page,
}) => {
  await page.goto('/panel.html?rows=300');
  await page.locator('[data-select="Counter"]').first().click();
  await page.keyboard.press('End');
  await expect(page.locator('[role="tree"]')).toBeFocused();

  const before = await page.locator('.rs-selected').getAttribute('id');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.rs-selected')).not.toHaveAttribute('id', before!);
});

test('the settings menu reports the build the panel is running', async ({ page }) => {
  await page.goto('/panel.html');
  await page.locator('[data-testid="runespect-settings"]').click();
  // The harness is served by vite, so there is no injected build stamp — it must say so rather
  // than show a misleading timestamp. A packaged panel gets version + built-at from vite define.
  await expect(page.locator('[data-testid="runespect-build-info"]')).toContainText('dev build');
  await expect(page.locator('[data-testid="runespect-build-info"]')).toContainText('protocol v1');
});

test('the status chip names the tier feeding the panel', async ({ page }) => {
  await page.goto('/panel.html');
  const status = page.locator('[data-testid="runespect-status"]');
  // The harness runs the app's own agent, so the handshake reports Live — the panel says so
  // rather than leaving the user to guess why (or whether) live state is available.
  await expect(status).toHaveAttribute('data-level', 'ok');
  await expect(status).toHaveText('Live');
});

test('the runtime event log is published to the page and covers the whole chain', async ({
  page,
}) => {
  await page.goto('/panel.html');
  await expect(page.locator('[data-testid="runespect-status"]')).toHaveText('Live');

  // Read both in one go: the log is live, so two round-trips can straddle a new event.
  const { events, dumped } = await page.evaluate(() => {
    const rs = window.__runespect!;
    return { events: [...rs.events], dumped: JSON.parse(rs.dump()).events.length as number };
  });
  // The harness runs the agent and the panel in one page, so the agent's own hop must be there…
  expect(events.some((e) => e.hop === 'agent' && e.ev === 'connect')).toBe(true);
  expect(events.some((e) => e.hop === 'agent' && e.ev === 'tx' && e.kind === 'tree')).toBe(true);
  // …and the surface must be usable the way docs/reference/event-log.md promises.
  expect(dumped).toBe(events.length);
});
