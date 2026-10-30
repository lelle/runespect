import { test, expect } from '@playwright/test';

// Smoke test of the main path (vite-plugin preprocessor + broadcast + <Inspect>
// overlay), exercised in a real browser. Catches what jsdom can't: real CSS/layout, real
// module rewriting, real window.postMessage timing.

test('overlay renders the live component tree in a real browser', async ({ page }) => {
  await page.goto('/');
  // The <Inspect> overlay (mounted on document.body) reflects the auto-instrumented app.
  await expect(page.locator('[data-component="Showcase"]').first()).toBeVisible();
  await expect(page.locator('[data-component="Counter"]').first()).toBeVisible();
});

test('editing a value in the overlay flows back into the app', async ({ page }) => {
  await page.goto('/');
  const edit = page.locator('[data-edit="Counter.count"]').first();
  await expect(edit).toBeVisible();
  await edit.fill('42');
  await edit.dispatchEvent('input');
  // The app's Counter button reflects the edited state (count / doubled).
  await expect(page.locator('#app button', { hasText: '42' }).first()).toBeVisible();
});

test('edit-at-path: editing a nested leaf of a writable $state object updates the app', async ({
  page,
}) => {
  await page.goto('/');
  // <Settings> exposes a writable object `settings = { theme, size }`; the overlay renders it as
  // an expandable editable value (not a lossy string input).
  const cell = page.locator('[data-edit="Settings.settings"]').first();
  await expect(cell).toBeVisible();
  await cell.locator('[data-expand]').first().click(); // drill into the object

  const sizeLeaf = cell.locator('li', { hasText: 'size:' }).locator('input[data-edit-leaf]');
  await expect(sizeLeaf).toHaveValue('10');
  await sizeLeaf.fill('20');
  await sizeLeaf.dispatchEvent('input');

  // the agent reassigns the whole $state object → the app reflects the nested change
  await expect(page.getByText('theme: dark, size: 20')).toBeVisible();
});

test('node actions: log to console and store-as-global', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/');
  await page.locator('[data-log="Counter"]').first().click();
  await page.locator('[data-global="Counter.count"]').first().click();
  await expect.poll(() => logs.some((l) => l.includes('runespect'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { $r: unknown }).$r)).toBe(1);
});

test('right-click context menu on a node logs to console', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/');
  await page.locator('a[data-open="Counter"]').first().click({ button: 'right' });
  const menu = page.getByTestId('runespect-context-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Log to console' }).click();
  await expect.poll(() => logs.some((l) => l.includes('runespect'))).toBe(true);
  await expect(menu).toBeHidden(); // closes after the action
});

test('overlay: clicking a node chevron collapses its subtree', async ({ page }) => {
  await page.goto('/');
  // StatelessHost ▸ Static, Bare
  await expect(page.locator('[data-component="Static"]').first()).toBeVisible();
  await page.locator('[data-collapse="StatelessHost"]').first().click();
  await expect(page.locator('[data-component="Static"]')).toHaveCount(0); // subtree collapsed
  await page.locator('[data-collapse="StatelessHost"]').first().click();
  await expect(page.locator('[data-component="Static"]').first()).toBeVisible(); // re-expanded
});

test('hovering a tree node highlights its element in the page', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-component="List"] > .name').first().hover();
  await expect(page.getByTestId('runespect-highlight')).toBeVisible();
});

test('hovering different instances of the same component highlights different elements', async ({
  page,
}) => {
  await page.goto('/');
  const counters = page.locator('[data-component="Counter"] > .name');
  await expect(counters.nth(1)).toBeVisible(); // the showcase has ≥2 Counter instances
  const highlight = page.getByTestId('runespect-highlight');

  await counters.nth(0).hover();
  await expect(highlight).toBeVisible();
  const box0 = await highlight.boundingBox();

  await counters.nth(1).hover();
  await expect(highlight).toBeVisible();
  const box1 = await highlight.boundingBox();

  // Distinct instances must highlight distinct elements, so the lookup matches more than the
  // (shared) source file.
  expect(box0).not.toBeNull();
  expect(box1).not.toBeNull();
  expect(box0!.x !== box1!.x || box0!.y !== box1!.y).toBe(true);
});

test('overlay: the state filter in the settings menu hides components without reactive values', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-component="Static"]').first()).toBeVisible(); // stateless
  await page.getByTestId('runespect-settings').click();
  await page.locator('[data-setting="Only components with state"]').check();
  await expect(page.locator('[data-component="Static"]')).toHaveCount(0); // hidden
  await expect(page.locator('[data-component="Counter"]').first()).toBeVisible(); // stateful kept
  await page.keyboard.press('Escape'); // the open menu lies over the filter's line
  await page.getByTestId('runespect-state-filter').getByRole('button').click();
  await expect(page.locator('[data-component="Static"]').first()).toBeVisible();
});

test('search filters the tree by component name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-component="Counter"]').first()).toBeVisible();
  await page.getByTestId('runespect-search').fill('List');
  await expect(page.locator('[data-component="List"]').first()).toBeVisible();
  await expect(page.locator('[data-component="Counter"]')).toHaveCount(0);
});

test('search: a match counter shows "n of m" and Enter cycles through matches', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByTestId('runespect-search');
  const count = page.getByTestId('runespect-search-count');
  await search.fill('Counter'); // the showcase has ≥2 Counter instances
  await expect(count).toHaveText(/^1 of [2-9]\d*$/);
  // nearest-on-first-search: the first match is selected
  await expect(page.locator('.rs-selected[data-component="Counter"]')).toBeVisible();
  await search.press('Enter'); // advance to the next match
  await expect(count).toHaveText(/^2 of [2-9]\d*$/);
  await search.press('Shift+Enter'); // back to the first
  await expect(count).toHaveText(/^1 of [2-9]\d*$/);
});

test('search: /regex/ syntax filters the tree', async ({ page }) => {
  await page.goto('/');
  const search = page.getByTestId('runespect-search');
  await search.fill('/^List$/'); // anchored: only the List component
  await expect(page.getByTestId('runespect-search-count')).toHaveText('1 of 1');
  await expect(page.locator('[data-component="List"]').first()).toBeVisible();
  await expect(page.locator('[data-component="Counter"]')).toHaveCount(0); // filtered out
});

test('context inspection: a getContext value is reported on the consuming node', async ({
  page,
}) => {
  await page.goto('/');
  // <ContextConsumer> reads `greeting` via getContext — it shows up as one of its values.
  const greeting = page.locator('[data-value="ContextConsumer.greeting"]').first();
  await expect(greeting).toBeVisible();
  await expect(greeting).toContainText('hi from context');
});

test('context inspection: setContext is reported as a "provided" object on the provider', async ({
  page,
}) => {
  await page.goto('/');
  // <ContextProvider> does setContext('greeting', 'hi from context') → a "provided" context object.
  const provided = page.locator('[data-value="ContextProvider.provided"]').first();
  await expect(provided).toBeVisible();
  await expect(provided).toContainText('greeting');
});

test('the overlay renders type-aware value previews', async ({ page }) => {
  await page.goto('/');
  const items = page.locator('[data-value="List.items"]').first();
  await expect(items).toBeVisible();
  await expect(items).toHaveAttribute('data-type', 'array');
  await expect(items).toContainText('Array(3)');
});

test('a read-only container can be expanded to drill into its entries', async ({ page }) => {
  await page.goto('/');
  const items = page.locator('[data-value="List.items"]').first();
  await items.locator('[data-expand]').click();
  await expect(items.locator('.rs-key')).toHaveCount(3); // ['a','b','c'] → 3 entries
});

test('element-picker: pick a component in the page → selected in the tree', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('runespect-pick').click();
  const counterEl = page.locator('#app button').first();
  await counterEl.hover();
  await expect(page.getByTestId('runespect-highlight')).toBeVisible();
  await counterEl.click(); // intercepted by the picker (does not increment)
  await expect(page.locator('.rs-selected[data-component="Counter"]')).toBeVisible();
});

test('component names are open-in-editor links', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('a[data-open="Counter"]').first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('href')).toMatch(/^vscode:\/\/file\/.*Counter\.svelte:\d+$/);
});

test('a changed value flashes in the overlay (flash-on-update)', async ({ page }) => {
  await page.goto('/');
  const countInput = page.locator('[data-edit="Counter.count"]').first();
  await expect(countInput).toBeVisible();
  await page.locator('#app button').first().click(); // mutate $state
  await expect(countInput).toHaveClass(/rs-flash/);
});

// A CSS animation only starts when its name changes: without that, a value changing again mid-blink
// would finish the first blink, and one changing all the time would show nothing at all.
test('a value that changes again flashes again, however often it changes', async ({ page }) => {
  await page.goto('/');
  const countInput = page.locator('[data-edit="Counter.count"]').first();
  await expect(countInput).toBeVisible();
  const button = page.locator('#app button').first();
  await button.click();

  for (let change = 0; change < 5; change++) {
    await page.waitForTimeout(300);
    await button.click();
    const progress = await countInput.evaluate((el) => {
      const [animation] = el.getAnimations();
      return animation?.playState === 'running' ? Number(animation.currentTime) : -1;
    });
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThan(250);
  }
});

for (const [surface, url] of [
  ['the overlay', '/'],
  ['the panel window', '/__runespect/?source=/'],
]) {
  test(`the settings button lines up with the rest of the toolbar in ${surface}`, async ({
    page,
  }) => {
    await page.goto(url);
    const gear = await page.getByTestId('runespect-settings').boundingBox();
    const pick = await page.getByTestId('runespect-pick').boundingBox();

    expect(gear?.y).toBe(pick?.y);
    expect(gear?.height).toBe(pick?.height);
  });
}

test('settings: turning off "Flash on update" suppresses the value blink', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear()); // start from the default (flash on)
  await page.reload();
  await page.getByTestId('runespect-settings').click(); // open the gear menu
  await page.locator('[data-setting="Flash on update"]').uncheck();
  const countInput = page.locator('[data-edit="Counter.count"]').first();
  await page.locator('#app button').first().click(); // mutate $state
  // give the flash animation a chance to (not) appear
  await page.waitForTimeout(150);
  await expect(countInput).not.toHaveClass(/rs-flash/);
});

test('settings: the Theme select restyles the overlay (data-theme + computed background)', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const overlay = page.getByTestId('runespect-overlay');
  await page.getByTestId('runespect-settings').click();

  await page.locator('[data-setting="Theme"]').selectOption('light');
  await expect(overlay).toHaveAttribute('data-theme', 'light');
  expect(await overlay.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)', // light --rs-bg actually applied
  );

  await page.locator('[data-setting="Theme"]').selectOption('dark');
  await expect(overlay).toHaveAttribute('data-theme', 'dark');
  expect(await overlay.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(30, 30, 30)', // #1e1e1e
  );
});

test('once the extension asks, the page broadcasts incremental ops over window.postMessage', async ({
  page,
}) => {
  await page.goto('/');
  // The runespect() vite plugin injects a broadcaster that waits for a panel's `request`: then a
  // full tree, then incremental ops on each change. Install the listener, ask as the extension's
  // panel does, then force a change.
  await page.evaluate(() => {
    (window as any).__rsMsgs = [];
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d?.source !== 'runespect') return;
      (window as any).__rsMsgs.push(d.kind);
      // The panel learns the page from its hello, then asks that page by its id.
      if (d.kind === 'hello' && !(window as any).__rsAsked) {
        (window as any).__rsAsked = true;
        window.postMessage({ source: 'runespect', kind: 'request', to: d.from }, '*');
      }
    });
    window.postMessage({ source: 'runespect', kind: 'request' }, '*');
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__rsMsgs.includes('tree')))
    .toBe(true);
  await page.locator('#app button').first().click(); // mutate $state → delta
  await expect.poll(() => page.evaluate(() => (window as any).__rsMsgs.includes('ops'))).toBe(true);
});

// The highlight is position:fixed with viewport coordinates, so it has to be recomputed when the
// page moves under it.
// Uses the context-menu action rather than hover: hovering clears the moment the pointer leaves.
test('the highlight follows its element when the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 350 }); // make the showcase scrollable
  await page.goto('/');
  await page.locator('a[data-open="Counter"]').first().click({ button: 'right' });
  await page
    .getByTestId('runespect-context-menu')
    .getByRole('menuitem', { name: 'Highlight in page' })
    .click();

  const highlight = page.getByTestId('runespect-highlight');
  await expect(highlight).toBeVisible();
  const target = page.locator('#app button').first();
  const before = await highlight.boundingBox();
  expect(Math.abs(before!.y - (await target.boundingBox())!.y)).toBeLessThan(4);

  // Scroll the window itself: a wheel event would land on the overlay, which has its own scroll.
  await page.evaluate(() => window.scrollTo(0, 200));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // it moved with the page…
  await expect.poll(async () => (await highlight.boundingBox())!.y).toBeLessThan(before!.y);
  const after = await highlight.boundingBox();
  // …and it is still on the element it highlights.
  expect(Math.abs(after!.y - (await target.boundingBox())!.y)).toBeLessThan(4);
});

// The overlay renders in a shadow root, so a host page's element rules cannot restyle it.
test("the host page's CSS does not reach the overlay", async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({
    content: 'button { text-transform: uppercase !important; font-size: 40px !important; }',
  });
  const pick = page.getByTestId('runespect-pick');
  await expect(pick).toBeVisible();
  expect(await pick.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
});

// A component's values belong to it: they start under its name, not left of it under the twirl.
test('in the overlay, a component’s values line up under its name', async ({ page }) => {
  await page.goto('/');
  const counter = page.locator('[data-component="Counter"]').first();
  await expect(counter).toBeVisible();
  const name = await counter.locator(':scope > .name').boundingBox();
  const sym = await counter.locator(':scope > .values .sym').first().boundingBox();
  const list = page.locator('[data-component="List"]').first();
  const snippet = await list.locator(':scope > .snippets .sym').first().boundingBox();
  const listName = await list.locator(':scope > .name').boundingBox();
  expect(Math.abs(sym!.x - name!.x)).toBeLessThan(1);
  expect(Math.abs(snippet!.x - listName!.x)).toBeLessThan(1);
});

test('svelte/reactivity values show their contents and follow the page', async ({ page }) => {
  await page.goto('/');
  const params = page.locator('[data-value="ReactivityComp.params"]').first();
  await expect(params).toContainText('URLSearchParams(1)');
  await params.locator('[data-expand]').first().click();
  await expect(params).toContainText('apple');
  await page.locator('#app button', { hasText: 'q=apple' }).click();
  await expect(params).toContainText('pear');

  const wide = page.locator('[data-value="ReactivityComp.wide"]').first();
  await expect(wide).toContainText('MediaQuery');
  await wide.locator('[data-expand]').first().click();
  await expect(wide).toContainText('true');
  await page.setViewportSize({ width: 500, height: 800 });
  await expect(wide).toContainText('false');
});
