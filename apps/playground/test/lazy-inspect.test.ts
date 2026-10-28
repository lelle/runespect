import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { Panel } from '@runespect/ui/internal';
import { isDehydratedValue } from '@runespect/agent/protocol/internal';

beforeEach(() => agent.reset());

test('Panel: expanding a dehydrated value requests inspect and renders the hydrated entries', () => {
  const sent: any[] = [];
  let listener: ((m: any) => void) | undefined;
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => ((listener = cb), () => {}),
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();

  // a node whose value is a dehydrated marker (as the depth-1 wire would send a nested object)
  const marker = { __runespect: 'dehydrated', type: 'object', preview: '{ theme } (1)', size: 1 };
  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [
      {
        id: 1,
        name: 'C',
        parent: null,
        children: [],
        values: { config: marker },
        snippets: [],
        writable: [],
      },
    ],
  });
  flushSync();
  (target.querySelector('[data-select="C"]') as HTMLElement).click(); // select → detail shows config
  flushSync();

  // expand the dehydrated value → an inspect request goes out for its path
  (
    target.querySelector('[data-detail-value="C.config"] [data-expand]') as HTMLButtonElement
  ).click();
  flushSync();
  expect(sent).toContainEqual({ source: 'runespect', kind: 'inspect', id: 1, path: ['config'] });

  // the page replies with the subtree → entries appear in place
  listener!({
    source: 'runespect',
    kind: 'hydrate',
    id: 1,
    path: ['config'],
    value: { theme: 'dark' },
  });
  flushSync();
  expect(target.querySelector('[data-detail-value="C.config"]')?.textContent).toContain('theme');
});

test('serialize(1) dehydrates nested values; serialize() keeps them full', () => {
  const id = agent.enter('C');
  agent.report(id, 'config', { theme: { mode: 'dark' }, size: 10 });

  const shallow = agent.serialize(1).find((n) => n.id === id)!;
  const config = shallow.values.config as Record<string, unknown>;
  expect(config.size).toBe(10); // top-level entry kept
  expect(isDehydratedValue(config.theme)).toBe(true); // nested object stubbed

  const full = agent.serialize().find((n) => n.id === id)!;
  expect((full.values.config as any).theme.mode).toBe('dark'); // full depth: not stubbed
});

test('inspectPath resolves a path and returns a shallow subtree', () => {
  const id = agent.enter('C');
  agent.report(id, 'config', { theme: { mode: 'dark', nested: { x: 1 } } });

  const hydrated = agent.inspectPath(id, ['config', 'theme']) as Record<string, unknown>;
  expect(hydrated.mode).toBe('dark');
  expect(isDehydratedValue(hydrated.nested)).toBe(true); // one level deep, then stubbed again
});

test('serialize(1) stubs a nested Map/Set instead of sending it whole', () => {
  const id = agent.enter('C');
  agent.report(id, 'cache', { entries: new Map([['a', 1]]), seen: new Set([1, 2, 3]) });

  const shallow = agent.serialize(1).find((n) => n.id === id)!;
  const cache = shallow.values.cache as Record<string, unknown>;
  const entries = cache.entries;
  const seen = cache.seen;
  expect(isDehydratedValue(entries)).toBe(true);
  expect((entries as any).type).toBe('map');
  expect((entries as any).preview).toBe('Map(1)');
  expect(isDehydratedValue(seen)).toBe(true);
  expect((seen as any).type).toBe('set');
  expect((seen as any).preview).toBe('Set(3)');
});

test('serialize() keeps Maps/Sets full (overlay depth); a top-level Map keeps its keys', () => {
  const id = agent.enter('C');
  agent.report(id, 'm', new Map<string, unknown>([['k', { deep: { x: 1 } }]]));

  // wire depth 1: the Map is encoded one level, its value stubbed
  const shallow = agent.serialize(1).find((n) => n.id === id)!;
  const [[key, value]] = (shallow.values.m as { entries: [unknown, unknown][] }).entries;
  expect(key).toBe('k');
  expect(isDehydratedValue(value)).toBe(true);

  // full depth: nothing stubbed
  const full = agent.serialize().find((n) => n.id === id)!;
  expect((full.values.m as { entries: [string, any][] }).entries[0][1].deep.x).toBe(1);
});

test('inspectPath fetches a stubbed Map and resolves a path through it', () => {
  const id = agent.enter('C');
  agent.report(id, 'cache', {
    entries: new Map<string, unknown>([['user', { name: 'ada', meta: { admin: true } }]]),
  });

  // fetch the Map itself → a depth-1 encoded Map (its values stubbed)
  const m = agent.inspectPath(id, ['cache', 'entries']) as { entries: [unknown, unknown][] };
  expect(m.entries[0][0]).toBe('user');
  expect(isDehydratedValue(m.entries[0][1])).toBe(true);

  // drill through the Map by the entry's index → the entry's value, one level deep
  const user = agent.inspectPath(id, ['cache', 'entries', 0]) as Record<string, unknown>;
  expect(user.name).toBe('ada');
  expect(isDehydratedValue(user.meta)).toBe(true);
});

test('inspectPath resolves a path through a Set by index', () => {
  const id = agent.enter('C');
  agent.report(id, 's', new Set([{ a: 1 }, { b: 2 }]));

  const second = agent.inspectPath(id, ['s', '1']) as Record<string, unknown>;
  expect(second.b).toBe(2);
});

test('inspectPath returns undefined for an unknown node or path', () => {
  expect(agent.inspectPath(999, ['x'])).toBeUndefined();
  const id = agent.enter('C');
  agent.report(id, 'a', { b: 1 });
  expect(agent.inspectPath(id, ['a', 'nope'])).toBeUndefined();
});

// Object keys all read "{ … }" in the panel, so a Map entry is addressed by its index, not its key.
test('inspectPath resolves a path through a Map keyed by objects', () => {
  const id = agent.enter('C');
  agent.report(
    id,
    'byOwner',
    new Map([
      [{ owner: 1 }, { name: 'first' }],
      [{ owner: 2 }, { name: 'second' }],
    ]),
  );

  const second = agent.inspectPath(id, ['byOwner', 1]) as Record<string, unknown>;
  expect(second.name).toBe('second');
});

function panelWith(values: Record<string, unknown>) {
  const sent: any[] = [];
  let listener: ((m: any) => void) | undefined;
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => ((listener = cb), () => {}),
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, { target, props: { transport } });
  flushSync();
  listener!({
    source: 'runespect',
    kind: 'tree',
    nodes: [{ id: 1, name: 'C', parent: null, children: [], values, snippets: [], writable: [] }],
  });
  flushSync();
  (target.querySelector('[data-select="C"]') as HTMLElement).click();
  flushSync();
  const expand = (n: number): void => {
    (target.querySelectorAll('[data-detail-value] [data-expand]')[n] as HTMLButtonElement).click();
    flushSync();
  };
  const reply = (path: unknown[], value: unknown): void => {
    listener!({ source: 'runespect', kind: 'hydrate', id: 1, path, value });
    flushSync();
  };
  const text = (): string => target.querySelector('[data-detail-value="C.m"]')!.textContent!;
  return { sent, expand, reply, text };
}

const stub = (preview: string) => ({
  __runespect: 'dehydrated',
  type: 'object',
  preview,
  size: 1,
});

test('Panel: expanding an entry inside a Map keeps the other entries', () => {
  const { sent, expand, reply, text } = panelWith({
    m: {
      __runespect: 'map',
      entries: [
        ['a', stub('{ x } (1)')],
        ['b', stub('{ y } (1)')],
      ],
    },
  });
  expand(0); // the Map
  expand(2); // its second entry
  expect(sent).toContainEqual({ source: 'runespect', kind: 'inspect', id: 1, path: ['m', 1] });

  reply(['m', 1], { y: 'loaded' });
  expect(text()).toContain('Map(2)');
  expect(text()).toContain('{ x } (1)');
  expect(text()).toContain('loaded');
});

test('Panel: expanding a member inside a Set keeps the other members', () => {
  const { expand, reply, text } = panelWith({
    m: { __runespect: 'set', values: [stub('{ x } (1)'), stub('{ y } (1)')] },
  });
  expand(0);
  expand(2);
  reply(['m', 1], { y: 'loaded' });
  expect(text()).toContain('Set(2)');
  expect(text()).toContain('{ x } (1)');
  expect(text()).toContain('loaded');
});

// An update replaces the node with a fresh depth-1 copy, so a value the user had expanded is a
// marker again. It must be fetched again rather than left showing "…".
test('Panel: an expanded value is fetched again after the node updates', () => {
  const marker = () => ({
    __runespect: 'dehydrated',
    type: 'object',
    preview: '{ theme } (1)',
    size: 1,
  });
  const node = (values: Record<string, unknown>) => ({
    id: 1,
    name: 'C',
    parent: null,
    children: [],
    values,
    snippets: [],
    writable: [],
  });
  const sent: any[] = [];
  let listener: ((m: any) => void) | undefined;
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, {
    target,
    props: {
      transport: {
        send: (m: any) => sent.push(m),
        onMessage: (cb: any) => ((listener = cb), () => {}),
      },
    },
  });
  flushSync();
  listener!({ source: 'runespect', kind: 'tree', nodes: [node({ config: marker(), n: 1 })] });
  flushSync();
  (target.querySelector('[data-select="C"]') as HTMLElement).click();
  flushSync();
  (
    target.querySelector('[data-detail-value="C.config"] [data-expand]') as HTMLButtonElement
  ).click();
  flushSync();
  const reply = (theme: string): void => {
    listener!({ source: 'runespect', kind: 'hydrate', id: 1, path: ['config'], value: { theme } });
    flushSync();
  };
  reply('dark');

  listener!({
    source: 'runespect',
    kind: 'ops',
    ops: [{ op: 'update', node: node({ config: marker(), n: 2 }) }],
    commit: 1,
    t: 0,
  });
  flushSync();
  const inspects = sent.filter((m) => m.kind === 'inspect');
  expect(inspects).toHaveLength(2);
  expect(inspects[1].path).toEqual(['config']);

  reply('light');
  expect(target.querySelector('[data-detail-value="C.config"]')?.textContent).toContain('light');
});

// What the panel fetched is not something the page changed: only what the page sent may flash.
test('Panel: a fetched value does not flash, before or after the node updates', () => {
  const marker = () => ({
    __runespect: 'dehydrated',
    type: 'object',
    preview: '{ a } (1)',
    size: 1,
  });
  const node = (values: Record<string, unknown>) => ({
    id: 1,
    name: 'C',
    parent: null,
    children: [],
    values,
    snippets: [],
    writable: [],
  });
  let listener: ((m: any) => void) | undefined;
  const target = document.body.appendChild(document.createElement('div'));
  mount(Panel, {
    target,
    props: { transport: { send: () => {}, onMessage: (cb: any) => ((listener = cb), () => {}) } },
  });
  flushSync();
  listener!({ source: 'runespect', kind: 'tree', nodes: [node({ cfg: marker(), n: 1 })] });
  flushSync();
  (target.querySelector('[data-select="C"]') as HTMLElement).click();
  flushSync();
  (target.querySelector('[data-detail-value="C.cfg"] [data-expand]') as HTMLButtonElement).click();
  flushSync();
  const flashing = () =>
    [...target.querySelectorAll('.rs-flash')].map(
      (el) =>
        el.closest('[data-detail-value]')?.getAttribute('data-detail-value') ?? el.textContent,
    );

  listener!({ source: 'runespect', kind: 'hydrate', id: 1, path: ['cfg'], value: { a: 1 } });
  flushSync();
  expect(flashing()).toEqual([]);

  const ops = [{ op: 'update', node: node({ cfg: marker(), n: 2 }) }];
  listener!({ source: 'runespect', kind: 'ops', ops, commit: 1, t: 0 });
  flushSync();
  expect(flashing().every((where) => !String(where).includes('cfg'))).toBe(true);
});
