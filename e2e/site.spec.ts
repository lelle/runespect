import { test, expect, type Page } from '@playwright/test';
import { TIER_DOCS_URL, TROUBLESHOOTING_URL } from '../packages/ui/src/status';
import { RUNE_FAVICON, faviconOf } from './favicon';

// The project site as GitHub Pages serves it: built to site/ and served under /runespect/. The
// site is prerendered, so every page and every link between them can be checked before it is
// published.

const ORIGIN = 'http://localhost:5183';
const SITE = `${ORIGIN}/runespect/`;
const PUBLISHED = 'https://lelle.github.io/runespect/';

const internalLinks = (page: Page) =>
  page.$$eval('a[href]', (links) => links.map((a) => (a as HTMLAnchorElement).href));

test('every page links only to pages and anchors that exist', async ({ page, request }) => {
  test.setTimeout(120_000);
  const seen = new Set<string>();
  const queue = [SITE];
  const broken: string[] = [];
  while (queue.length) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const response = await page.goto(url);
    if (response?.status() !== 200) {
      broken.push(`${url} → ${response?.status()}`);
      continue;
    }
    if (url.includes('/demo/')) continue;
    for (const href of await internalLinks(page)) {
      if (!href.startsWith(SITE)) continue;
      const [target, anchor] = href.split('#');
      if (anchor) {
        const ids = await (await request.get(target)).text();
        if (!ids.includes(`id="${anchor}"`)) broken.push(`${url} → ${href}`);
      }
      queue.push(target);
    }
  }
  expect(broken).toEqual([]);
  expect(seen.size).toBeGreaterThan(15);
});

test('a directory without its slash is sent to it, as GitHub Pages does', async ({ request }) => {
  const response = await request.get(`${SITE}docs/how-to/troubleshoot`, { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()['location']).toBe('/runespect/docs/how-to/troubleshoot/');
  expect((await request.get(`${SITE}%E0%A4%A`)).status()).toBe(400);
  expect((await request.get(SITE)).status()).toBe(200);
});

test('a missing page answers 404 with a way back', async ({ page }) => {
  const response = await page.goto(`${SITE}no/such/page/`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'runespect' }).first()).toBeVisible();
});

for (const [name, url] of [
  ['the tier link', TIER_DOCS_URL],
  ['the troubleshooting link', TROUBLESHOOTING_URL],
]) {
  test(`${name} in the panel opens a page of the site`, async ({ request }) => {
    expect(url.startsWith(PUBLISHED)).toBe(true);
    const [target, anchor] = url.replace(PUBLISHED, SITE).split('#');
    const response = await request.get(target);
    expect(response.status()).toBe(200);
    if (anchor) expect(await response.text()).toContain(`id="${anchor}"`);
  });
}

test('the front page leads to the demo and the docs', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('h1')).toHaveText('runespect');
  await page.getByRole('link', { name: 'Try it live' }).click();
  await expect(page.locator('#panel [data-select="Shop"]').first()).toBeVisible();
  await page.goto(SITE);
  await page.getByRole('link', { name: 'Read the docs' }).click();
  await expect(page.locator('main h1')).toHaveText('Docs');
});

test('a docs page marks itself in the menu and links to its neighbours', async ({ page }) => {
  await page.goto(`${SITE}docs/tutorials/getting-started/`);
  await expect(page.locator('.docs-menu a[aria-current="page"]')).toHaveText('Getting started');
  await expect(page.locator('.pager .prev .name')).toHaveText('Overview');
  await expect(page.locator('.pager .next .name')).toHaveText('Use with SvelteKit');
  await expect(page.locator('pre[data-copy] .t-keyword').first()).toBeVisible();
});

test('diagrams are drawn, and fit a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const doc of ['explanation/architecture', 'reference/event-log']) {
    await page.goto(`${SITE}docs/${doc}/`);
    const diagrams = page.locator('main.doc figure.diagram svg');
    expect(await diagrams.count()).toBeGreaterThan(0);
    expect(await page.locator('main.doc pre', { hasText: '──' }).count()).toBe(0);
    for (const svg of await diagrams.all()) {
      const box = (await svg.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
});

test('the theme switch turns the page, and the choice survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(SITE);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
});

test('every page has the rune as its favicon', async ({ page }) => {
  for (const url of [SITE, `${SITE}docs/`]) {
    await page.goto(url);
    expect(await faviconOf(page), url).toBe(RUNE_FAVICON);
  }
});

// The menu carries the rune on every page; the front page's heading carries the whole glass. Both
// are decoration, so the link and the heading keep their names.
test('the menu shows the rune, and the front page the glass', async ({ page }) => {
  const shown = (selector: string) =>
    page.$eval(
      selector,
      (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
    );
  for (const url of [SITE, `${SITE}docs/`]) {
    await page.goto(url);
    expect(await shown('nav.site > a:first-child img'), url).toBe(true);
    await expect(page.getByRole('link', { name: 'runespect', exact: true })).toBeVisible();
  }
  await page.goto(SITE);
  expect(await shown('h1 img')).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'runespect' })).toBeVisible();
});
