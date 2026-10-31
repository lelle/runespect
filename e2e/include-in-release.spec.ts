import { test, expect, type Page } from '@playwright/test';

// A real `vite build` with includeInRelease, served as static files: no dev server and no HMR
// channel. The page speaks to a panel over window.postMessage, as it does to the extension.

const PLAYGROUND = 'http://localhost:5193/';
const SVELTEKIT = 'http://localhost:5194/prerendered';

const errorsOn = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

const counterAfterEdit = (page: Page) =>
  page.evaluate(async () => {
    const agent = window.__runespect!;
    const counter = agent.tree().find((n) => n.name === 'Counter')!;
    const applied = agent.set(counter.id, 'count', 4242);
    await new Promise((r) => setTimeout(r, 200));
    return {
      applied,
      values: agent.values(counter.id)!,
      shown: document.body.innerText.includes('4242'),
      loc: counter.loc,
      history: agent.history().length,
    };
  });

for (const [name, url] of [
  ['a plain Vite build', PLAYGROUND],
  ['a SvelteKit build, hydrated', SVELTEKIT],
]) {
  test(`${name} has the tree, values, editing and history`, async ({ page }) => {
    const errors = errorsOn(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__runespect?.tree().some((n) => n.name === 'Counter'));

    const edited = await counterAfterEdit(page);

    expect(edited.applied).toBe(true);
    expect(edited.values.state).toMatchObject({ count: 4242 });
    expect(edited.values.derived).toMatchObject({ doubled: 8484 });
    expect(edited.shown).toBe(true);
    expect(edited.history).toBeGreaterThan(0);
    expect(edited.loc).toMatch(/^src\/.*Counter\.svelte/);
    expect(errors).toEqual([]);
  });
}

test('a plain Vite build reports module state', async ({ page }) => {
  await page.goto(PLAYGROUND);
  await page.waitForFunction(() =>
    window.__runespect?.tree().some((n) => n.name === 'cart.svelte.ts'),
  );
});

// A panel's conversation with the page: who is there, then the tree, in the protocol's own messages.
const askAsAPanel = (page: Page) =>
  page.evaluate(async () => {
    const seen: Record<string, any> = {};
    addEventListener('message', (e) => {
      if (e.data?.source === 'runespect') seen[e.data.kind] = e.data;
    });
    const send = (m: object) => postMessage({ source: 'runespect', ...m }, '*');
    send({ kind: 'request' });
    await new Promise((r) => setTimeout(r, 200));
    send({ kind: 'request', to: seen.hello.from });
    await new Promise((r) => setTimeout(r, 300));
    return { hello: seen.hello, tree: seen.tree };
  });

test('a panel sees Live, a tree, and no Open in editor', async ({ page }) => {
  await page.goto(PLAYGROUND);
  await page.waitForFunction(() => window.__runespect?.tree().length);

  const { hello, tree } = await askAsAPanel(page);

  expect(hello.tier).toBe(0);
  expect(hello.openInEditor).toBe(false);
  expect(tree).toBeTruthy();
});

test('highlight and the picker find the elements of a minified build', async ({ page }) => {
  await page.goto(PLAYGROUND);
  await page.waitForFunction(() => window.__runespect?.tree().some((n) => n.name === 'Counter'));
  const { hello } = await askAsAPanel(page);
  const counter = await page.evaluate(
    () => window.__runespect!.tree().find((n) => n.name === 'Counter')!.id,
  );

  await page.evaluate(
    ([id, to]) => postMessage({ source: 'runespect', kind: 'highlight', id, to }, '*'),
    [counter, hello.from],
  );
  const button = page.locator('#app button').first();
  const boxes = await page.evaluate(
    () =>
      [...document.body.querySelectorAll('*')].filter(
        (el) => getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width > 0,
      ).length,
  );
  expect(boxes).toBeGreaterThan(0);

  const picked = page.evaluate(
    () =>
      new Promise((resolve) =>
        addEventListener('message', (e) => {
          if (e.data?.source === 'runespect' && e.data.kind === 'picked') resolve(e.data.id);
        }),
      ),
  );
  await page.evaluate(
    (to) => postMessage({ source: 'runespect', kind: 'pick', active: true, to }, '*'),
    hello.from,
  );
  await button.click();
  expect(await picked).toEqual(expect.any(Number));
});

for (const [name, origin, path] of [
  ['a plain Vite build', PLAYGROUND, ''],
  ['a SvelteKit build', SVELTEKIT.replace('/prerendered', '/'), 'prerendered'],
]) {
  test(`the panel window of ${name} shows and edits the app, with no dev server`, async ({
    context,
  }) => {
    const app = await context.newPage();
    await app.goto(origin + path);
    const panel = await context.newPage();
    const errors = errorsOn(panel);
    await panel.goto(`${origin}__runespect/?source=/${path}`);

    await expect(panel.locator('[data-select="Counter"]').first()).toBeVisible();
    await panel.locator('[data-select="Counter"]').first().click();
    const edit = panel.locator('[data-detail-edit="Counter.count"]').first();
    await edit.fill('4242');
    await edit.dispatchEvent('input');

    await expect(app.locator('button', { hasText: '4242' }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}
