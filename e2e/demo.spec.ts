import { test, expect } from '@playwright/test';
import { RUNE_FAVICON, faviconOf } from './favicon';

// The demo on the project site is a static production build: no dev server, no runespect(). It has
// to show the same panel the plugin gives, from a bundle that carries no path of the machine that
// built it.

const DEMO = 'http://localhost:5182/runespect/demo/';

test('the demo shows the shop in the panel at Tier 0', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#panel [data-select="Shop"]').first()).toBeVisible();
  await expect(page.locator('#panel [data-select="Cart"]').first()).toBeVisible();
  await expect(page.locator('#panel', { hasText: 'Tier 0' })).toBeVisible();
});

test('an edit in the panel changes the shop', async ({ page }) => {
  await page.goto(DEMO);
  await page.getByRole('button', { name: 'Add to cart' }).nth(2).click();
  await page.locator('#panel [data-select="Cart"]').first().click();
  const coupon = page.locator('[data-detail-edit="Cart.coupon"]').first();
  await coupon.fill('SPRING');
  await coupon.dispatchEvent('input');
  await expect(page.locator('#app .total')).toHaveText('Total: 7.11 EUR');
});

test('module state shows under Modules with a path relative to the demo', async ({ page }) => {
  await page.goto(DEMO);
  const locs = await page.evaluate(() =>
    (window as unknown as { __runespect: { tree(): { loc?: string }[] } }).__runespect
      .tree()
      .map((n) => n.loc)
      .filter(Boolean),
  );
  expect(locs).toContain('src/cart.svelte.ts');
  expect(locs).toContain('src/Cart.svelte');
  expect(locs.filter((loc) => loc!.startsWith('/'))).toEqual([]);
});

test('each item in the cart is its own component, added and removed live', async ({ page }) => {
  await page.goto(DEMO);
  const lines = page.locator('#panel [data-select="CartLine"]');
  await expect(lines).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to cart' }).nth(0).click();
  await page.getByRole('button', { name: 'Add to cart' }).nth(1).click();
  await expect(lines).toHaveCount(2);
  await page.getByRole('button', { name: 'remove Apple' }).click();
  await expect(lines).toHaveCount(1);
});

test('the state filter hides the components that have no values', async ({ page }) => {
  await page.goto(DEMO);
  const footer = page.locator('#panel [data-select="Footer"]');
  await expect(footer).toHaveCount(1);
  await page.locator('#panel').getByTestId('runespect-settings').click();
  await page.locator('#panel [data-setting="Only components with state"]').check();
  await expect(footer).toHaveCount(0);
  await expect(page.locator('#panel [data-select="Shop"]').first()).toBeVisible();
  await page.keyboard.press('Escape'); // the open menu lies over the filter's line
  await page.locator('#panel').getByTestId('runespect-state-filter').getByRole('button').click();
  await expect(footer).toHaveCount(1);
});

// A flat row clips what is outside it: an outline around the name would lose its top and bottom.
test('the frame of a selected name fits inside its row, and the name stays where it was', async ({
  page,
}) => {
  await page.goto(DEMO);
  const name = page.locator('#panel [data-select]').nth(1);
  const before = await name.boundingBox();

  await name.click();

  const selected = page.locator('#panel .rs-selected > .name');
  const frame = await selected.boundingBox();
  const row = await page.locator('#panel .rs-selected').boundingBox();
  expect(frame!.y).toBeGreaterThanOrEqual(row!.y);
  expect(frame!.y + frame!.height).toBeLessThanOrEqual(row!.y + row!.height);
  expect(await selected.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(frame!.x + 5).toBeCloseTo(before!.x, 0);
});

test('a $bindable prop edited in the panel changes its parent', async ({ page }) => {
  await page.goto(DEMO);
  await page.locator('#panel [data-select="Quantity"]').first().click();
  const value = page.locator('[data-detail-edit="Quantity.value"]').first();
  await value.fill('3');
  await value.dispatchEvent('input');
  await expect(page.locator('#app .qty').first()).toHaveText('3');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.locator('#app .line').first()).toContainText('3 × Apple');
});

test('a snippet, a legacy component and a SvelteSet show in the panel', async ({ page }) => {
  await page.goto(DEMO);
  const detail = page.getByTestId('runespect-detail');
  await page.locator('#panel [data-select="Cart"]').first().click();
  await expect(detail.locator('[data-group="snippet"]')).toContainText('actions');
  await page.locator('#panel [data-select="Banner"]').first().click();
  await expect(detail.locator('[data-detail-row="Banner.message"]')).toContainText('SPRING');
  await page.getByRole('button', { name: 'favourite Coffee' }).click();
  await page.locator('#panel [data-select="Shop"]').first().click();
  const favourites = detail.locator('[data-detail-row="Shop.favourites"]');
  await favourites.locator('[data-expand]').first().click();
  await expect(favourites).toContainText('Coffee');
});

test('checkout mounts, places an order in raw module state, and leaves', async ({ page }) => {
  await page.goto(DEMO);
  const checkout = page.locator('#panel [data-select="Checkout"]');
  await page.getByRole('button', { name: 'Add to cart' }).nth(2).click();
  await expect(checkout).toHaveCount(0);
  await page.getByRole('button', { name: 'Check out' }).click();
  await expect(checkout).toHaveCount(1);
  await page.locator('#app').getByLabel('Name').fill('Ada');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(checkout).toHaveCount(0);
  await expect(page.locator('#panel [data-select="CartLine"]')).toHaveCount(0);
  await page.locator('#panel [data-select="orders.svelte.ts"]').first().click();
  const orders = page.locator('[data-detail-row="orders.svelte.ts.orders"]');
  await orders.locator('[data-expand]').first().click();
  await orders.locator('[data-expand]').nth(1).click();
  await expect
    .poll(() =>
      orders
        .locator('input')
        .evaluateAll((inputs: HTMLInputElement[]) => inputs.map((i) => i.value)),
    )
    .toContain('Ada');
});

// The demo is built with Svelte's dev runtime, which tags elements with their component: what pick
// and highlight read, as they do in an app on the dev server.
test('hovering a component in the panel draws its box in the shop', async ({ page }) => {
  await page.goto(DEMO);
  await page.locator('#panel [data-select="Cart"]').first().hover();
  const box = page.locator('[data-runespect-highlight]');
  await expect(box).toBeVisible();
  const cart = (await page.locator('#app h2', { hasText: 'Cart' }).boundingBox())!;
  const drawn = (await box.boundingBox())!;
  expect(drawn.y).toBeLessThanOrEqual(cart.y);
  expect(drawn.y + drawn.height).toBeGreaterThan(cart.y + cart.height);
});

test('pick selects the component under the element clicked in the shop', async ({ page }) => {
  await page.goto(DEMO);
  await page.getByTestId('runespect-pick').click();
  await page.locator('#app h2', { hasText: 'Cart' }).click();
  await expect(page.locator('#panel .rs-selected[data-component="Cart"]')).toBeVisible();
});

// A visitor has no checkout to open, so the demo turns Open in editor off.
test('the demo offers no Open in editor', async ({ page }) => {
  await page.goto(DEMO);
  await page.locator('#panel [data-select="Cart"]').first().click();
  await page.locator('#panel [data-select="Cart"]').first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Highlight in page' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open in editor' })).toHaveCount(0);
  await expect(page.locator('#panel [data-detail-source]')).toHaveCount(0);
});

test('the demo has the rune as its favicon', async ({ page }) => {
  await page.goto(DEMO);
  expect(await faviconOf(page)).toBe(RUNE_FAVICON);
});
