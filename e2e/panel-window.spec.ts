import { test, expect } from '@playwright/test';
import { RUNE_FAVICON, faviconOf } from './favicon';

declare global {
  interface Window {
    __runespect_tier0?: boolean;
  }
}

// The standalone panel window: <Panel> served by the app's own dev server at /__runespect/, talking
// to the page over Vite's HMR channel. No browser extension involved — the same component, a
// different Transport. See docs/explanation/architecture.md.
//
// Every page here is opened at its own url and the panel is opened *for* that url
// (`/__runespect/?source=…`). The dev server is shared with the other spec files, so anything less
// specific would be a coin flip over which page the panel follows.

test('the panel window renders the app tree over the dev-server channel', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=renders');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=renders');

  await expect(panel.locator('[data-select="Showcase"]').first()).toBeVisible();
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();
  await expect(panel.locator('[data-testid="runespect-status"]')).toHaveText('Tier 0');
});

test('editing from the panel window changes the app in the other tab', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=edit');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=edit');

  await panel.locator('[data-select="Counter"]').first().click();
  const edit = panel.locator('[data-detail-edit="Counter.count"]').first();
  await expect(edit).toBeVisible();
  await edit.fill('99');
  await edit.dispatchEvent('input');

  await expect(app.locator('#app button', { hasText: '99 / 198' }).first()).toBeVisible();
});

test('the panel window works alongside the page, without an extension', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=alongside');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=alongside');
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();

  // The app keeps its own window.postMessage broadcast for the extension — both consumers at once.
  const tier0 = await app.evaluate(() => window.__runespect_tier0 === true);
  expect(tier0).toBe(true);
});

test('history records what changed, with before and after', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=history');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=history');
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();

  // Drive a real state change in the app, then find it in the panel's history.
  await app.locator('#app button').first().click();

  await panel.locator('[data-tab="history"]').click();
  const commit = panel.locator('[data-commit]').first();
  await expect(commit).toBeVisible();
  await commit.click();
  // The changes live in the detail pane beside the list, the same shape the tree tab has.
  const detail = panel.locator('[data-testid="runespect-history-detail"]');
  await expect(detail.locator('[data-change="Counter.count"]').first()).toBeVisible();
  await expect(detail.locator('[data-change-detail="Counter.count"]')).toContainText('1');
  await expect(detail.locator('[data-change-detail="Counter.count"]')).toContainText('2');
});

// Until a panel opens the agent reads nothing, so the history starts there: what happened before is
// not in it, and what happens after is.
test('history starts when a panel opens', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=backlog&no-overlay');
  await app.locator('#app button').first().click(); // BEFORE any panel exists
  await app.locator('#app button').first().click();

  const panel = await context.newPage();
  await panel.goto(`/__runespect/?source=${encodeURIComponent('/?case=backlog&no-overlay')}`);
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();
  await panel.locator('[data-tab="history"]').click();
  await expect(panel.locator('[data-commit]')).toHaveCount(0);

  await app.locator('#app button').first().click();
  await expect(panel.locator('[data-commit]')).toHaveCount(1);
  await panel.locator('[data-commit]').first().click();
  const change = panel.locator('[data-change-detail="Counter.count"]');
  await expect(change).toContainText('before 3 after 4'); // it starts at 1, clicked twice before
});

test('clicking a change in history selects that component in the tree', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=crosslink');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=crosslink');
  await app.locator('#app button').first().click();

  await panel.locator('[data-tab="history"]').click();
  await panel.locator('[data-commit]').first().click();
  await panel.locator('[data-change="Counter.count"]').first().click();
  await panel.locator('[data-tab="tree"]').click();

  await expect(panel.locator('.rs-selected')).toBeVisible();
});

// Two tabs of the same app on one dev server: the channel carries both, so the panel names the tab
// it follows and offers the other, and never answers with the wrong page's state.
test('with two app tabs open, the panel names which one it follows and can switch', async ({
  context,
}) => {
  const first = await context.newPage();
  await first.goto('/?case=two-tabs');
  const second = await context.newPage();
  await second.goto('/?case=two-tabs-second');

  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=two-tabs');
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();

  // The chip says which page, not just which tier.
  const source = panel.locator('[data-testid="runespect-source"]');
  await expect(source).toBeVisible();
  const followed = await source.textContent();

  // …and the other tab is offered rather than silently interfering. Not an exact count: other
  // tests run against this same dev server, and their pages are legitimate sources too — which is
  // the very situation the picker exists for. The followed page's tree can arrive before the other
  // tab's hello on a slow machine, and until then there is nothing to choose: the chip is not a
  // button yet.
  await expect(panel.locator('button[data-testid="runespect-source"]')).toBeVisible();
  await source.click();
  const picker = panel.locator('[data-testid="runespect-sources"]');
  await expect(picker).toBeVisible();
  await expect(picker.locator('button', { hasText: 'two-tabs-second' })).toHaveCount(1);

  await picker.locator('button', { hasText: 'two-tabs-second' }).click();
  await expect(source).toContainText('two-tabs-second'); // now following the other tab
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();
  expect(followed).not.toContain('two-tabs-second'); // it was following the first one before
});

// Every page on the dev server hears every command, so a panel that follows one addresses them;
// otherwise an edit from the panel would change the same component in both open tabs.
test('an edit reaches only the page the panel follows', async ({ context }) => {
  const followed = await context.newPage();
  await followed.goto('/?case=addressed');
  const other = await context.newPage();
  await other.goto('/?case=addressed-other');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=addressed'); // opened for the first tab, not the other one
  await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();

  await panel.locator('[data-select="Counter"]').first().click();
  const edit = panel.locator('[data-detail-edit="Counter.count"]').first();
  await edit.fill('77');
  await edit.dispatchEvent('input');

  await expect(followed.locator('#app button', { hasText: '77 / 154' }).first()).toBeVisible();
  await expect(other.locator('#app button', { hasText: '77 / 154' })).toHaveCount(0);
});

// A DevTools-sized panel and a long route: the toolbar fits the window, so the panel does not scroll
// sideways and `pick` stays on one line.
test('a long page url does not push the panel wider than its window', async ({ context }) => {
  const route = '/?case=orders-EU-2026-000123-checkout-lines-summary-and-details';
  const app = await context.newPage();
  await app.goto(route);
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 640, height: 600 });
  await panel.goto(`/__runespect/?source=${route}`);
  await expect(panel.locator('[data-testid="runespect-source"]')).toBeVisible();

  const overflow = await panel.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const pick = await panel.locator('[data-testid="runespect-pick"]').boundingBox();
  const filter = await panel.locator('.toolbar .search').first().boundingBox();
  expect(pick!.height).toBeLessThanOrEqual(filter!.height);
});

test('a value preview that wraps keeps its name on the first line', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/?case=wrapped-preview');
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 600 });
  await panel.goto('/__runespect/?source=/?case=wrapped-preview');
  await panel.locator('[data-select="Settings"]').first().click();

  const row = panel.locator('[data-detail-row="Settings.settings"]');
  const name = await row.locator('.rs-sym').boundingBox();
  const preview = await row.locator('.rs-toggle').first().boundingBox();
  expect(preview!.height).toBeGreaterThan(name!.height * 1.5); // it does wrap
  expect(Math.abs(name!.y - preview!.y)).toBeLessThan(name!.height / 2);
});

// State in a .svelte.ts module, edited from the panel the same way as a component's.
test('module state shows under Modules and can be edited from the panel window', async ({
  context,
}) => {
  const app = await context.newPage();
  await app.goto('/?case=module');
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=module');
  await expect(panel.locator('[data-select="Modules"]').first()).toBeVisible();

  await panel.locator('[data-select="cart.svelte.ts"]').first().click();
  const code = panel.locator('[data-detail-edit="cart.svelte.ts.coupon.code"]').first();
  await expect(code).toHaveValue('');
  await code.fill('WINTER');
  await code.dispatchEvent('input');

  await expect(app.locator('#app button', { hasText: 'coupon: WINTER' })).toBeVisible();
});

test('the panel window has the rune as its favicon', async ({ context }) => {
  const panel = await context.newPage();
  await panel.goto('/__runespect/?source=/?case=favicon');
  expect(await faviconOf(panel)).toBe(RUNE_FAVICON);
});

// A file type the panel build starts to emit, and the plugin's table does not know, would go out as
// application/octet-stream and might not load.
test('every file the panel window loads is served with its type', async ({ context }) => {
  const panel = await context.newPage();
  const types: Record<string, string> = {};
  panel.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/__runespect/')) {
      types[response.url()] = response.headers()['content-type'] ?? '';
    }
  });
  await panel.goto('/__runespect/?source=/?case=types');
  await expect(panel.locator('[data-testid="runespect-status"]')).toBeVisible();
  expect(Object.keys(types).length).toBeGreaterThan(1);
  const untyped = Object.entries(types).filter(([, type]) => type === 'application/octet-stream');
  expect(untyped).toEqual([]);
});
