import { test, expect } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Detail, Panel } from '@runespect/ui/internal';
import type { SerializedNode } from '@runespect/agent/protocol/internal';

const counter: SerializedNode = {
  id: 1,
  name: 'Counter',
  parent: null,
  children: [],
  snippets: [],
  values: { label: 'hi', count: 5, doubled: 10 },
  writable: ['count'],
  kinds: { label: 'prop', count: 'state', doubled: 'derived' },
  loc: 'src/Counter.svelte:3',
};

function mountInto<T extends Record<string, unknown>>(Comp: any, props: T): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Comp, { target, props });
  flushSync();
  return target;
}

test('Detail groups the selected node by kind and renders each value', () => {
  const target = mountInto(Detail, { node: counter });
  // section per kind, in order
  const groups = [...target.querySelectorAll('[data-group]')].map((e) =>
    e.getAttribute('data-group'),
  );
  expect(groups).toEqual(['prop', 'state', 'derived']);
  // writable → editable input prefilled with the value
  const edit = target.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement;
  expect(edit.value).toBe('5');
  // read-only derived → value text, no input
  expect(target.querySelector('[data-detail-edit="Counter.doubled"]')).toBeNull();
  expect(target.querySelector('[data-detail-value="Counter.doubled"]')?.textContent).toContain(
    '10',
  );
});

test('Detail edit fires onEdit with a type-coerced value', () => {
  const edits: any[] = [];
  const target = mountInto(Detail, {
    node: counter,
    onEdit: (id: number, sym: string, path: unknown[], v: unknown) =>
      edits.push({ id, sym, path, v }),
  });
  const edit = target.querySelector('[data-detail-edit="Counter.count"]') as HTMLInputElement;
  edit.value = '8';
  edit.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(edits).toContainEqual({ id: 1, sym: 'count', path: [], v: 8 });
});

test('Detail: a writable object is edited at a nested path, not via a lossy string input', () => {
  const edits: any[] = [];
  const node: SerializedNode = {
    id: 1,
    name: 'C',
    parent: null,
    children: [],
    snippets: [],
    values: { config: { theme: 'dark', size: 10 } },
    writable: ['config'],
    kinds: { config: 'state' },
  };
  const target = mountInto(Detail, {
    node,
    onEdit: (id: number, sym: string, path: unknown[], v: unknown) =>
      edits.push({ id, sym, path, v }),
  });

  const cell = target.querySelector('[data-detail-edit="C.config"]') as HTMLElement;
  expect(cell).toBeTruthy();
  // not a flat input prefilled with the lossy preview, which an edit would write back
  expect(cell.querySelector('input[value="{ theme, size } (2)"]')).toBeNull();

  // expand and edit the nested numeric leaf
  (cell.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  const sizeInput = [...cell.querySelectorAll('input[data-edit-leaf]')].find(
    (i) => (i as HTMLInputElement).value === '10',
  ) as HTMLInputElement;
  expect(sizeInput).toBeTruthy();
  sizeInput.value = '20';
  sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  // only the edited field is sent, by its path, type-coerced
  expect(edits).toContainEqual({ id: 1, sym: 'config', path: ['size'], v: 20 });
});

test('Detail shows a source link when the node has a loc', () => {
  const target = mountInto(Detail, { node: counter });
  const src = target.querySelector('[data-detail-source]') as HTMLAnchorElement;
  expect(src).toBeTruthy();
  expect(src.getAttribute('href')).toContain('Counter.svelte');
});

test('Detail: a changed value flashes (highlight-updates in the panel)', async () => {
  const { tick } = await import('svelte');
  const { render } = await import('@testing-library/svelte');
  const mk = (count: number): SerializedNode => ({
    id: 1,
    name: 'Counter',
    parent: null,
    children: [],
    snippets: [],
    values: { count, label: 'x' },
    writable: ['count'],
    kinds: { count: 'state', label: 'prop' },
  });
  const { container, rerender } = render(Detail, { node: mk(1) });
  expect(container.querySelector('.rs-flash')).toBeNull(); // calm on first render

  await rerender({ node: mk(2) }); // count changes
  await tick();
  const countCell = container.querySelector('[data-detail-edit="Counter.count"]') as HTMLElement;
  const labelCell = container.querySelector('[data-detail-value="Counter.label"]') as HTMLElement;
  expect(countCell.classList.contains('rs-flash')).toBe(true);
  expect(labelCell.classList.contains('rs-flash')).toBe(false); // unchanged → no flash
});

test('Detail with no selected node shows a placeholder', () => {
  const target = mountInto(Detail, { node: null });
  expect(target.querySelector('[data-detail-empty]')).toBeTruthy();
});

test('Panel split: tree shows names only; clicking a name selects it into the detail pane', () => {
  let listener: ((m: any) => void) | undefined;
  const transport = { send: () => {}, onMessage: (cb: any) => ((listener = cb), () => {}) };
  const target = mountInto(Panel, { transport });

  listener!({ source: 'runespect', kind: 'tree', nodes: [counter] });
  flushSync();

  // tree renders the component name but NOT its inline values
  expect(target.querySelector('[data-component="Counter"]')).toBeTruthy();
  expect(target.querySelector('[data-edit="Counter.count"]')).toBeNull();
  // nothing selected yet → detail placeholder
  expect(target.querySelector('[data-detail-empty]')).toBeTruthy();

  // click the name → node becomes selected and its values appear in the detail pane
  (target.querySelector('[data-select="Counter"]') as HTMLElement).click();
  flushSync();
  expect(target.querySelector('[data-detail-edit="Counter.count"]')).toBeTruthy();
});

// An input can only round-trip the type it started from: a null would come back as a string, and a
// text box turns a half-typed "tru" into false.
const flags: SerializedNode = {
  id: 1,
  name: 'F',
  parent: null,
  children: [],
  snippets: [],
  values: { selected: null, open: true, opts: { dense: false, picked: null, size: 1 } },
  writable: ['selected', 'open', 'opts'],
  kinds: { selected: 'state', open: 'state', opts: 'state' },
};

test('Detail: a null value is shown read-only', () => {
  const target = mountInto(Detail, { node: flags });
  expect(target.querySelector('[data-detail-edit="F.selected"]')).toBeNull();
  expect(target.querySelector('[data-detail-value="F.selected"]')?.textContent).toBe('null');
});

test('Detail: a boolean is edited with a checkbox', () => {
  const edits: any[] = [];
  const target = mountInto(Detail, {
    node: flags,
    onEdit: (id: number, sym: string, path: unknown[], v: unknown) =>
      edits.push({ id, sym, path, v }),
  });
  const open = target.querySelector('[data-detail-edit="F.open"]') as HTMLInputElement;
  expect(open.type).toBe('checkbox');
  expect(open.checked).toBe(true);
  open.click();
  flushSync();
  expect(edits).toContainEqual({ id: 1, sym: 'open', path: [], v: false });
});

test('Detail: inside an object, a boolean gets a checkbox and a null no input', () => {
  const edits: any[] = [];
  const target = mountInto(Detail, {
    node: flags,
    onEdit: (id: number, sym: string, path: unknown[], v: unknown) =>
      edits.push({ id, sym, path, v }),
  });
  const opts = target.querySelector('[data-detail-edit="F.opts"]') as HTMLElement;
  (opts.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();

  const leaves = [...opts.querySelectorAll<HTMLInputElement>('input[data-edit-leaf]')];
  expect(leaves.map((i) => i.type)).toEqual(['checkbox', 'text']);
  leaves[0].click();
  flushSync();
  expect(edits).toContainEqual({ id: 1, sym: 'opts', path: ['dense'], v: true });
});
