import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Panel } from '@runespect/ui/internal';

// Drive Panel with a controllable transport and assert it sends the right page-side action
// messages and reacts to `picked`.
function setup() {
  let listener: ((m: any) => void) | undefined;
  const sent: any[] = [];
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => ((listener = cb), () => {}),
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();
  // give the panel a tree to render
  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [
      {
        id: 1,
        name: 'Counter',
        parent: null,
        children: [],
        values: { count: 5 },
        snippets: [],
        writable: ['count'],
      },
    ],
  });
  flushSync();
  return { sent, emit: (m: any) => (listener!(m), flushSync()), target };
}

test('the pick button toggles page-side pick mode', () => {
  const { sent, target } = setup();
  (target.querySelector('[data-testid="runespect-pick"]') as HTMLButtonElement).click();
  flushSync();
  expect(sent.some((m) => m.kind === 'pick' && m.active === true)).toBe(true);
});

test('a picked reply selects the node in the tree', () => {
  const { emit, target } = setup();
  emit({ source: 'runespect', kind: 'picked', id: 1 });
  expect(target.querySelector('.rs-selected[data-component="Counter"]')).toBeTruthy();
});

test('hovering a node sends a highlight message', () => {
  const { sent, target } = setup();
  const name = target.querySelector('[data-component="Counter"] .name') as HTMLElement;
  name.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  flushSync();
  expect(sent.some((m) => m.kind === 'highlight' && m.id === 1)).toBe(true);
});

test('log and store-as-global buttons send page-side action messages', () => {
  const { sent, target } = setup();
  // select the node so its actions appear in the detail pane (React-style split)
  (target.querySelector('[data-select="Counter"]') as HTMLButtonElement).click();
  flushSync();
  (target.querySelector('[data-detail-log="Counter"]') as HTMLButtonElement).click();
  (target.querySelector('[data-detail-global="Counter.count"]') as HTMLButtonElement).click();
  flushSync();
  expect(sent.some((m) => m.kind === 'log' && m.id === 1)).toBe(true);
  expect(sent.some((m) => m.kind === 'storeGlobal' && m.id === 1 && m.symbol === 'count')).toBe(
    true,
  );
});
