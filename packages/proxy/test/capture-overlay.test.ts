import { test, expect, afterEach } from 'vitest';
import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { mountCaptureOverlay } from '../src/overlay.js';
import { overlayModule, bridgeModule } from '../src/served.js';

// The capture overlay: a plain-DOM tree injected into the page's main world during a capture,
// driven by window.__runespectReconstruct(). Two layers are tested:
// the typed mountCaptureOverlay logic, and the self-contained string overlayModule() that is
// actually injected (the shipped artifact) — evaluated here in jsdom.

const tree = (): SerializedNode[] => [
  { id: 1, name: 'App', parent: null, children: [2], values: {}, snippets: [], writable: [] },
  {
    id: 2,
    name: 'Counter',
    parent: 1,
    children: [],
    values: { count: 5, doubled: 10 },
    snippets: [],
    writable: ['count'],
  },
];

afterEach(() => {
  document.body.innerHTML = '';
  const g = globalThis as any;
  if (g.__rsOverlayTimer) clearInterval(g.__rsOverlayTimer);
  if (g.__rsBridgeTimer) clearInterval(g.__rsBridgeTimer);
  delete g.__rsOverlayTimer;
  delete g.__rsOverlayMounted;
  delete g.__rsOverlay;
  delete g.__rsBridge;
  delete g.__rsBridgeTimer;
  delete g.__runespectReconstruct;
});

const tick = () => new Promise((r) => setTimeout(r, 10));

test('bridgeModule does NOT broadcast an empty tree (capture with no recorded data)', async () => {
  (globalThis as any).__runespectReconstruct = () => []; // [] is truthy — must still be skipped
  const posted: any[] = [];
  const onMsg = (e: MessageEvent) => posted.push(e.data);
  window.addEventListener('message', onMsg);

  (0, eval)(bridgeModule());
  await tick();

  expect(posted.filter((m) => m && m.source === 'runespect' && m.kind === 'tree')).toHaveLength(0);
  window.removeEventListener('message', onMsg);
});

test('bridgeModule broadcasts the tree (Tier-0 format) and answers panel requests', async () => {
  // a function value (e.g. dev HMR wrapper / snippet) must not break structured clone
  (globalThis as any).__runespectReconstruct = () => {
    const t = tree();
    (t[1].values as Record<string, unknown>).onclick = () => {};
    return t;
  };
  const posted: any[] = [];
  const onMsg = (e: MessageEvent) => posted.push(e.data);
  window.addEventListener('message', onMsg);

  (0, eval)(bridgeModule()); // must not throw DataCloneError
  await tick();

  const trees = posted.filter((m) => m && m.source === 'runespect' && m.kind === 'tree');
  expect(trees.length).toBeGreaterThan(0);
  expect(trees[0].nodes[1].name).toBe('Counter');
  // the function value was made clone-safe (a function marker)
  expect(trees[0].nodes[1].values.onclick).toMatchObject({ __runespect: 'function' });

  // a panel request triggers an immediate re-broadcast (the relay forwards request → page)
  posted.length = 0;
  window.postMessage({ source: 'runespect', kind: 'request' }, '*');
  await tick();
  expect(posted.some((m) => m && m.kind === 'tree')).toBe(true);

  window.removeEventListener('message', onMsg);
});

test('the copy button writes the indented structure to the clipboard', async () => {
  let copied = '';
  Object.defineProperty(window.navigator, 'clipboard', {
    value: {
      writeText: (t: string) => {
        copied = t;
        return Promise.resolve();
      },
    },
    configurable: true,
  });

  const handle = mountCaptureOverlay(document, tree);
  const btn = document.querySelector('[data-action="copy"]') as HTMLButtonElement;
  expect(btn).toBeTruthy();
  btn.click();
  await Promise.resolve();

  expect(copied).toBe('App\n  Counter  count: 5, doubled: 10');
  expect(btn.textContent).toBe('copied'); // gives feedback
  handle.destroy();
});

test('the injected overlayModule() string includes the copy button', () => {
  expect(overlayModule()).toContain('data-action');
});

test('prod props are cleaned: prefix stripped, <dynamic> values hidden', async () => {
  let copied = '';
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: (t: string) => ((copied = t), Promise.resolve()) },
    configurable: true,
  });

  const prodTree = (): SerializedNode[] => [
    {
      id: 1,
      name: '<+page>',
      parent: null,
      children: [2],
      values: { name: 'SvelteKit' },
      snippets: [],
      writable: ['name'],
    },
    {
      id: 2,
      name: '<Counter>',
      parent: 1,
      children: [],
      values: { count: 1, doubled: 2, 'prop:start': 1, 'prop:label': '<dynamic>' },
      snippets: [],
      writable: ['count'],
    },
  ];
  const handle = mountCaptureOverlay(document, prodTree);

  // on screen: prop rows tagged, the dynamic one shows only its name
  expect(document.querySelector('[data-symbol="start"][data-prop]')).toBeTruthy();
  expect(document.querySelector('[data-value="<Counter>.label"]')).toBeNull(); // <dynamic> → no value

  // copy: no "prop:" prefix, no "<dynamic>"
  document.querySelector<HTMLButtonElement>('[data-action="copy"]')!.click();
  await Promise.resolve();
  expect(copied).toBe(
    '<+page>  name: SvelteKit\n  <Counter>  count: 1, doubled: 2, start: 1, label',
  );
  expect(copied).not.toContain('prop:');
  expect(copied).not.toContain('<dynamic>');
  handle.destroy();
});

test('mountCaptureOverlay renders the reconstructed tree with nested components and live values', () => {
  const handle = mountCaptureOverlay(document, tree);

  const overlay = document.querySelector('[data-testid="runespect-capture-overlay"]')!;
  expect(overlay).toBeTruthy();

  const app = overlay.querySelector('[data-component="App"]')!;
  expect(app).toBeTruthy();
  // Counter is nested inside App, not a sibling
  expect(app.querySelector('[data-component="Counter"]')).toBeTruthy();

  expect(overlay.querySelector('[data-value="Counter.count"]')!.textContent).toBe('5');
  expect(overlay.querySelector('[data-value="Counter.doubled"]')!.textContent).toBe('10');

  handle.destroy();
});

test('update() re-reads the source and reflects changed values; destroy() removes the panel', () => {
  let nodes = tree();
  const handle = mountCaptureOverlay(document, () => nodes);
  expect(document.querySelector('[data-value="Counter.count"]')!.textContent).toBe('5');

  nodes = [{ ...tree()[0] }, { ...tree()[1], values: { count: 6, doubled: 12 } }];
  handle.update();
  expect(document.querySelector('[data-value="Counter.count"]')!.textContent).toBe('6');

  handle.destroy();
  expect(document.querySelector('[data-testid="runespect-capture-overlay"]')).toBeNull();
});

test('shows an empty state when nothing has been captured yet', () => {
  const handle = mountCaptureOverlay(document, () => []);
  expect(document.querySelector('[data-empty]')).toBeTruthy();
  handle.destroy();
});

test('overlayModule(): the injected string mounts the overlay from window.__runespectReconstruct', () => {
  (globalThis as any).__runespectReconstruct = () => tree();

  // mirrors a host evaluating the injected source in the page's main world
  (0, eval)(overlayModule());

  const overlay = document.querySelector('[data-testid="runespect-capture-overlay"]')!;
  expect(overlay).toBeTruthy();
  expect(overlay.querySelector('[data-value="Counter.count"]')!.textContent).toBe('5');
});

test('overlayModule(): guards against double injection (runs for every document)', () => {
  (globalThis as any).__runespectReconstruct = () => tree();
  (0, eval)(overlayModule());
  (0, eval)(overlayModule());
  expect(document.querySelectorAll('[data-testid="runespect-capture-overlay"]')).toHaveLength(1);
});

test('the capture overlay says it is experimental', () => {
  mountCaptureOverlay(document, tree);
  const overlay = document.querySelector('[data-testid="runespect-capture-overlay"]')!;
  expect(overlay.textContent).toContain('experimental');
});
