// After a hot update to a multi-instance leaf component, every instance stays in the agent's tree
// and stays reactive. Svelte's HMR re-render flush can drop writes to a deeply-reactive $state
// array, so the agent keeps a plain node array and a single $state `version` signal (see
// @runespect/agent).
//
// This is NOT part of `pnpm e2e` (that suite is fullyParallel against a shared dev server; a
// file-editing test would HMR every page and flake the others). It is self-contained: it spawns
// its own dev server on port 5188, edits Counter.svelte, asserts survival, then restores.
//
// Run: pnpm test:hmr
import { chromium, type Browser, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sleep, startServer, waitForUrl } from './lib.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COUNTER = resolve(root, 'apps/playground/src/Counter.svelte');
const CART = resolve(root, 'apps/playground/src/modules/cart.svelte.ts');
const PORT = 5188;

// Read until `done` holds or ten seconds pass; the last reading either way.
const poll = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> => {
  let value!: T;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    value = await read();
    if (done(value)) break;
  }
  return value;
};
const counts = (page: Page): Promise<string[]> =>
  page.$$eval('[data-edit="Counter.count"]', (els) =>
    els.map((e) => (e as HTMLInputElement).value),
  );

const original = readFileSync(COUNTER, 'utf8');
const originalCart = readFileSync(CART, 'utf8');
// The module's node as the console reads it: one per file, and its items.
const cartNodes = (page: Page): Promise<{ id: number; items: number | undefined }[]> =>
  page.evaluate(() => {
    const rs = window.__runespect!;
    return rs.find('/^cart\\.svelte\\.ts$/').map((n) => ({
      id: n.id,
      items: (rs.values(n.id)?.state?.items as unknown[] | undefined)?.length,
    }));
  });
let server: ReturnType<typeof startServer> | undefined;
let browser: Browser | undefined;
let failed = false;
const fail = (msg: string): void => {
  failed = true;
  console.error('✗ ' + msg);
};

try {
  server = startServer(['--filter', 'playground', 'dev', '--port', String(PORT), '--strictPort'], {
    cwd: root,
  });
  await waitForUrl(`http://localhost:${PORT}/`);

  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-component="Counter"]');
  await sleep(400);

  const before = await counts(page);
  console.log('before HMR: Counter inputs =', JSON.stringify(before));
  if (before.length < 2) fail(`expected ≥2 Counter instances before HMR, got ${before.length}`);

  // trigger HMR: edit the (multi-instance) Counter component
  writeFileSync(COUNTER, original.replace('{count} / {doubled}', '{count} / {doubled}<i>X</i>'));
  const applied = await poll(
    () => page.textContent('#app').catch(() => ''),
    (t) => !!t?.includes('X'),
  );
  if (!applied?.includes('X')) fail('HMR edit never applied to the app DOM');
  await sleep(600);

  const after = await counts(page);
  console.log('after HMR:  Counter inputs =', JSON.stringify(after));
  if (after.length !== before.length)
    fail(`tree went stale: ${before.length} Counter instances before, ${after.length} after`);

  // reactivity: clicking a Counter must still update its value in the overlay
  await page.click('#app button');
  await sleep(300);
  const reacted = await counts(page);
  if (JSON.stringify(reacted) === JSON.stringify(after))
    fail('agent stopped reacting after HMR — overlay value did not update on click');
  else console.log('after click: Counter inputs =', JSON.stringify(reacted), '(reactive ✓)');

  // A .svelte.ts module that runs again must replace its node, not leave a frozen copy behind, and
  // the new node must follow the new module's state.
  const [cartBefore] = await cartNodes(page);
  if (!cartBefore) fail('no node for cart.svelte.ts before the module edit');
  writeFileSync(CART, originalCart + '\n// edited by hmr-survival\n');
  const cartAfter = await poll(
    () => cartNodes(page),
    (nodes) => nodes.some((n) => n.id !== cartBefore?.id),
  );
  console.log('module before/after HMR =', JSON.stringify(cartBefore), JSON.stringify(cartAfter));
  if (cartAfter.length !== 1)
    fail(`expected one cart.svelte.ts node after HMR, got ${cartAfter.length}`);
  else if (cartAfter[0].id === cartBefore?.id) fail('the module edit never reached the agent');
  await page.locator('section', { hasText: 'Module state' }).locator('button').first().click();
  await sleep(300);
  const [cartClicked] = await cartNodes(page);
  if (cartClicked?.items !== (cartAfter[0]?.items ?? 0) + 1)
    fail(`module node stopped following its state: ${JSON.stringify(cartClicked)}`);
  else console.log('after click: module items =', cartClicked.items, '(reactive ✓)');

  if (!failed) console.log('\n✓ HMR survival: tree intact and reactive after an edit');
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
} finally {
  writeFileSync(COUNTER, original);
  writeFileSync(CART, originalCart);
  await browser?.close();
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
