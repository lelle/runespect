import { test, expect } from 'vitest';
import { startTier1 } from '../../../packages/extension/src/content-tier1';

// Build a fake window whose document.body holds one __svelte_meta-tagged element, so the Tier-1
// DOM-walk finds a component. setInterval is stubbed; startTier1 runs tick() once synchronously.
function setup(tier0: boolean) {
  const body = document.createElement('div');
  const el = document.createElement('span');
  (el as unknown as { __svelte_meta: unknown }).__svelte_meta = {
    loc: { file: '/src/Foo.svelte', line: 1 },
  };
  body.appendChild(el);
  const posted: any[] = [];
  let tick = () => {};
  const listeners: ((e: { data: unknown; source: unknown }) => void)[] = [];
  const win: any = {
    document: { body },
    postMessage: (m: any) => posted.push(m),
    setInterval: (cb: () => void) => ((tick = cb), 1),
    clearInterval: () => {},
    addEventListener: (type: string, l: any) => type === 'message' && listeners.push(l),
    removeEventListener: () => {},
    _tick: () => tick(),
    _emit: (data: unknown) => listeners.forEach((l) => l({ data, source: win })),
  };
  if (tier0) win.__runespect_tier0 = true;
  return { win, posted };
}

test('Tier-1 broadcasts the DOM-walk tree when Tier-0 is absent', () => {
  const { win, posted } = setup(false);
  startTier1(win, 1000);
  expect(posted.filter((m) => m.kind === 'tree')).toHaveLength(1);
});

test('Tier-1 yields (no broadcast) when Tier-0 owns the page', () => {
  const { win, posted } = setup(true);
  startTier1(win, 1000);
  expect(posted).toHaveLength(0);
});

// Tier-1 runs on every tab, and an SVG or XML document has no <body>: it must stay quiet there
// rather than throw in the page's console once a second.
test('Tier-1 does nothing on a document without a body', () => {
  const { win, posted } = setup(false);
  win.document = { body: null };
  expect(() => startTier1(win, 1000)).not.toThrow();
  expect(posted).toHaveLength(0);
});

// Posting the whole tree every second, panel or not, would keep the service worker busy.
test('Tier-1 posts again only when the tree changed, or when a panel asks for it', () => {
  const { win, posted } = setup(false);
  startTier1(win, 1000);
  win._tick();
  win._tick();
  expect(posted.filter((m) => m.kind === 'tree')).toHaveLength(1);

  win._emit({ source: 'runespect', kind: 'request' });
  expect(posted.filter((m) => m.kind === 'tree')).toHaveLength(2);

  const added = document.createElement('b');
  (added as unknown as { __svelte_meta: unknown }).__svelte_meta = {
    loc: { file: '/src/Bar.svelte', line: 1 },
  };
  win.document.body.appendChild(added);
  win._tick();
  expect(posted.filter((m) => m.kind === 'tree')).toHaveLength(3);
});
