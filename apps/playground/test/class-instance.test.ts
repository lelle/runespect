import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import {
  isDehydratedValue,
  isErrorValue,
  writeEncoded,
  type Message,
  type SerializedNode,
} from '@runespect/agent/protocol/internal';
import { Detail, Inspect, formatValue, entriesOf } from '@runespect/ui/internal';
import { instrumented, instrumentedModule } from './helpers/instrumented';
import { openPanel } from './helpers/agent';

beforeEach(() => agent.reset());

// The shape Svelte 5 compiles `token = $state('t')` into: a private signal behind a get/set pair on
// the prototype. Object.keys() does not see it, and it is the state a reader is after.
class Auth {
  plain = 1;
  #token = 't';
  get token(): string {
    return this.#token;
  }
  set token(v: string) {
    this.#token = v;
  }
  #user = { name: 'ada', roles: ['admin'] };
  get user(): { name: string; roles: string[] } {
    return this.#user;
  }
  set user(v: { name: string; roles: string[] }) {
    this.#user = v;
  }
  // Computed by the app: reading it runs the app's code, so the devtools leave it alone.
  get loggedIn(): boolean {
    throw new Error('a computed getter must not be read');
  }
  logout(): void {
    this.token = '';
  }
}

class Broken {
  get value(): number {
    throw new Error('not ready');
  }
  set value(_v: number) {}
}

// Its $state fields make it state: sent with them, one level deep, so a change to one reaches the
// panel. What they hold deeper is fetched on demand like any other value.
test('a class instance with $state fields is sent with them, one level deep', () => {
  const id = agent.enter('C');
  agent.report(id, 'auth', new Auth());
  const sent = agent.serialize(1).find((n) => n.id === id)!.values.auth as any;
  expect(sent).toMatchObject({ __runespect: 'instance', name: 'Auth' });
  expect(Object.keys(sent.fields)).toEqual(['plain', 'token', 'user']);
  expect(sent.fields.token).toBe('t');
  expect(isDehydratedValue(sent.fields.user)).toBe(true);
});

test('expanding a class instance shows its own fields and its get/set pairs', () => {
  const id = agent.enter('C');
  agent.report(id, 'auth', new Auth());
  const expanded = agent.inspectPath(id, ['auth']) as any;
  expect(expanded).toMatchObject({ __runespect: 'instance', name: 'Auth' });
  expect(Object.keys(expanded.fields)).toEqual(['plain', 'token', 'user']);
  expect(expanded.fields.token).toBe('t');
  expect(isDehydratedValue(expanded.fields.user)).toBe(true); // one level, like any other value

  const user = agent.inspectPath(id, ['auth', 'user']) as any;
  expect(user.name).toBe('ada');
});

test('a field whose getter throws is shown as the error, and a path through it does not throw', () => {
  const id = agent.enter('C');
  agent.report(id, 'b', new Broken());
  const expanded = agent.inspectPath(id, ['b']) as any;
  expect(isErrorValue(expanded.fields.value)).toBe(true);
  expect(() => agent.inspectPath(id, ['b', 'value', 'deeper'])).not.toThrow();
});

test('a DOM element is not offered as expandable', () => {
  const id = agent.enter('C');
  agent.report(id, 'el', document.createElement('div'));
  const stub = agent.serialize(1).find((n) => n.id === id)!.values.el;
  expect(stub).toMatchObject({ size: 0 });
});

const instance = {
  __runespect: 'instance',
  name: 'Auth',
  fields: {
    token: 't',
    user: { __runespect: 'dehydrated', type: 'object', preview: '{}', size: 1 },
  },
};

test('the panel shows an expanded instance with its class name and fields', () => {
  expect(formatValue(instance)).toBe('Auth { token, user } (2)');
  expect(entriesOf(instance).map(([k]) => k)).toEqual(['token', 'user']);
  const spliced = writeEncoded(instance, ['user'], { name: 'ada' }) as typeof instance;
  expect(spliced.fields.user).toEqual({ name: 'ada' });
  expect(spliced.name).toBe('Auth');
});

test('the fields of an instance are read-only, even in a writable value', () => {
  const node: SerializedNode = {
    id: 1,
    name: 'C',
    parent: null,
    children: [],
    snippets: [],
    values: { holder: { auth: instance, n: 1 } },
    writable: ['holder'],
    kinds: { holder: 'state' },
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Detail, { target, props: { node } });
  flushSync();
  const cell = target.querySelector('[data-detail-edit="C.holder"]') as HTMLElement;
  for (const button of cell.querySelectorAll<HTMLButtonElement>('[data-expand]')) button.click();
  flushSync();
  for (const button of cell.querySelectorAll<HTMLButtonElement>('[data-expand]')) {
    if (button.getAttribute('aria-expanded') === 'false') button.click();
  }
  flushSync();

  expect(cell.textContent).toContain('token');
  const leaves = [...cell.querySelectorAll<HTMLInputElement>('input[data-edit-leaf]')];
  expect(leaves.map((i) => i.value)).toEqual(['1']); // only `n`, nothing inside the instance
});

test('the in-page overlay can expand a class instance', () => {
  const id = agent.enter('Svc');
  agent.report(id, 'auth', new Auth());
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  mount(Inspect, { target: overlay });
  flushSync();
  const shadow = overlay.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;

  const value = shadow.querySelector('[data-value="Svc.auth"]') as HTMLElement;
  (value.querySelector('[data-expand]') as HTMLButtonElement).click();
  flushSync();
  expect(value.textContent).toContain('token');
  expect(value.textContent).toContain('t');
  expect(value.textContent).not.toContain('…');
});

// Expanding reads the instance; the app changed nothing, so nothing may flash.
test('expanding a class instance in the overlay does not flash it', () => {
  const id = agent.enter('Svc');
  agent.report(id, 'auth', new Auth());
  const overlay = document.body.appendChild(document.createElement('div'));
  mount(Inspect, { target: overlay });
  flushSync();
  const shadow = overlay.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;

  (shadow.querySelector('[data-value="Svc.auth"] [data-expand]') as HTMLButtonElement).click();
  flushSync();

  expect(shadow.querySelectorAll('.rs-flash')).toHaveLength(0);
});

// The value a component holds is the same instance before and after; only its fields change.
test('a field change of an instance a component holds reaches the panel', async () => {
  const m = await instrumentedModule(
    `let n = $state(0);\nexport const bump = () => n++;\nexport class Box { value = $state(1); }`,
    { filename: 'held-box.svelte.ts' },
  );
  const box = new (m.exports.Box as new () => { value: number })();
  const c = await instrumented(`<script>let { box } = $props();</script><p>{box.value}</p>`, {
    props: { box },
  });
  const sent: Message[] = [];
  agent.connect(openPanel({ send: (msg) => sent.push(msg), onMessage: () => () => {} }));
  flushSync();
  const before = sent.length;

  box.value = 7;
  flushSync();

  const ops = sent.slice(before).flatMap((msg) => (msg.kind === 'ops' ? msg.ops : []));
  expect(ops).toContainEqual({
    op: 'update',
    node: expect.objectContaining({
      id: c.node.id,
      values: { box: { __runespect: 'instance', name: 'Box', fields: { value: 7 } } },
    }),
  });
});
