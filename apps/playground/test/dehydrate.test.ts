import { test, expect } from 'vitest';
import { dehydrate } from '@runespect/agent/protocol/internal';
import { isDehydratedValue, isFunctionValue } from '@runespect/agent/protocol/internal';

test('dehydrate: primitives pass through unchanged', () => {
  expect(dehydrate(5, 1)).toBe(5);
  expect(dehydrate('hi', 1)).toBe('hi');
  expect(dehydrate(null, 1)).toBe(null);
  expect(dehydrate(true, 1)).toBe(true);
});

test('dehydrate: at depth 1 the top-level entries are kept, nested containers are stubbed', () => {
  const out = dehydrate({ a: 1, nested: { b: 2, c: 3 } }, 1) as Record<string, unknown>;
  expect(out.a).toBe(1);
  expect(isDehydratedValue(out.nested)).toBe(true);
  expect(out.nested).toMatchObject({
    type: 'object',
    size: 2,
    preview: expect.stringContaining('b'),
  });
});

test('dehydrate: arrays keep top-level items, stub nested arrays', () => {
  const out = dehydrate([1, [2, 3, 4]], 1) as unknown[];
  expect(out[0]).toBe(1);
  expect(isDehydratedValue(out[1])).toBe(true);
  expect(out[1]).toMatchObject({ type: 'array', size: 3, preview: 'Array(3)' });
});

test('dehydrate: depth 0 stubs the container itself', () => {
  const out = dehydrate({ a: 1, b: 2 }, 0);
  expect(isDehydratedValue(out)).toBe(true);
  expect(out).toMatchObject({ type: 'object', size: 2 });
});

test('dehydrate: cycles terminate (stubbed when seen again)', () => {
  const o: Record<string, unknown> = { x: 1 };
  o.self = o;
  const out = dehydrate(o, 5) as Record<string, unknown>;
  expect(out.x).toBe(1);
  expect(isDehydratedValue(out.self)).toBe(true); // self-reference stubbed, no infinite loop
});

test('dehydrate: functions become a function marker', () => {
  expect(isFunctionValue(dehydrate(() => {}, 1))).toBe(true);
});

test('dehydrate: Map/Set are encoded one level deep (deep values stubbed)', () => {
  const out = dehydrate(new Map<string, unknown>([['k', { deep: 1 }]]), 1);
  expect(out).toMatchObject({ __runespect: 'map', entries: [['k', expect.anything()]] });
  expect(isDehydratedValue((out as any).entries[0][1])).toBe(true); // deep value stubbed at depth 0

  const outSet = dehydrate(new Set([{ x: 1 }]), 1);
  expect(outSet).toMatchObject({ __runespect: 'set' });
  expect(isDehydratedValue((outSet as any).values[0])).toBe(true);
});

test('dehydrate: a Map/Set below the depth bound becomes a dehydrated marker', () => {
  const marker = dehydrate(new Map([['a', 1]]), 0);
  expect(isDehydratedValue(marker)).toBe(true);
  expect((marker as any).type).toBe('map');
  expect((marker as any).preview).toBe('Map(1)');

  const setMarker = dehydrate(new Set([1, 2]), 0);
  expect((setMarker as any).type).toBe('set');
  expect((setMarker as any).preview).toBe('Set(2)');
});

// A value that survives dehydrate() must survive structuredClone(), because the wire is
// window.postMessage: one un-cloneable value doesn't degrade that value, it throws and the whole
// tree never reaches the panel. Class instances (services, stores, SDK clients) carry methods, so
// they are the realistic source of this.
class Store {
  value = 1;
  set(v: number): void {
    this.value = v;
  }
  subscribe(): () => void {
    return () => {};
  }
}

test('dehydrate: a class instance is stubbed, not passed through with its methods', () => {
  const out = dehydrate(new Store(), 1);
  expect(isDehydratedValue(out)).toBe(true);
  expect(out).toMatchObject({ type: 'object', preview: expect.stringContaining('Store') });
});

test('dehydrate: a class instance nested in state does not break the wire', () => {
  const out = dehydrate({ store: new Store(), n: 2 }, 1);
  expect(() => structuredClone(out)).not.toThrow();
  expect((out as Record<string, unknown>).n).toBe(2); // the rest of the value is unaffected
});

test('dehydrate: anything left un-cloneable is replaced rather than allowed to kill the tree', () => {
  const weird = Object.assign(Object.create(null), { fn: () => {} });
  expect(() => structuredClone(dehydrate({ weird }, 3))).not.toThrow();
  expect(() => structuredClone(dehydrate({ el: globalThis.document?.body }, 2))).not.toThrow();
});

// Svelte parks a derived that hasn't been computed yet at Symbol(uninitialized), and a symbol is
// not structured-cloneable — so one un-run derived would abort the whole postMessage.
test('dehydrate: a symbol becomes its description, so it can cross the wire', () => {
  expect(dehydrate(Symbol('uninitialized'), 1)).toBe('Symbol(uninitialized)');
  expect(() => structuredClone(dehydrate({ derived: Symbol('uninitialized') }, 2))).not.toThrow();
});

test('dehydrate: URLSearchParams is sent as its pairs, in order and with repeated keys', () => {
  expect(dehydrate(new URLSearchParams('a=1&b=2&a=3'), 1)).toEqual({
    __runespect: 'urlsearchparams',
    entries: [
      ['a', '1'],
      ['b', '2'],
      ['a', '3'],
    ],
  });
  expect(dehydrate({ q: new URLSearchParams('a=1&b=2') }, 1)).toEqual({
    q: {
      __runespect: 'dehydrated',
      type: 'urlsearchparams',
      preview: 'URLSearchParams(2)',
      size: 2,
    },
  });
});

test('dehydrate: a getter-only `current` is read, other getters without a setter are not', () => {
  let reads = 0;
  class Reactive {
    get current() {
      return true;
    }
    get costly() {
      reads++;
      return 1;
    }
  }
  expect(dehydrate({ r: new Reactive() }, 1)).toMatchObject({
    r: { preview: 'Reactive { current } (1)', size: 1 },
  });
  expect(dehydrate(new Reactive(), 1)).toEqual({
    __runespect: 'instance',
    name: 'Reactive',
    fields: { current: true },
  });
  expect(dehydrate(new Reactive(), 1, { expandInstance: true })).toEqual({
    __runespect: 'instance',
    name: 'Reactive',
    fields: { current: true },
  });
  expect(reads).toBe(0);
});

test('dehydrate: reactive values that point at each other end, even at full depth', () => {
  class Step {
    next: Step | null = null;
    get current() {
      return 1;
    }
  }
  const a = new Step();
  const b = new Step();
  a.next = b;
  b.next = a;
  const out = dehydrate(a, Infinity) as { fields: { next: { fields: { next: unknown } } } };
  expect(out.fields.next.fields.next).toMatchObject({ __runespect: 'dehydrated' });
});

test('dehydrate: a plain field named `current` does not make a reactive value', () => {
  let reads = 0;
  class Carousel {
    current = 0;
    get costly() {
      reads++;
      return {};
    }
  }
  expect(dehydrate(new Carousel(), Infinity)).toMatchObject({ __runespect: 'dehydrated' });
  expect(reads).toBe(0);
});

// Svelte compiles a `$state` class field into a get/set pair over a private signal. An instance with
// one is reactive state, sent with its fields like a `current`, so a change to a field reaches the
// panel; a service with only methods and plain fields stays a stub (above).
class Box {
  #value = 1;
  get value() {
    return this.#value;
  }
  set value(v: number) {
    this.#value = v;
  }
  bump(): void {
    this.#value++;
  }
}

test('dehydrate: an instance with $state fields is sent with them', () => {
  expect(dehydrate(new Box(), 1)).toEqual({
    __runespect: 'instance',
    name: 'Box',
    fields: { value: 1 },
  });
  expect(dehydrate({ box: new Box() }, 1)).toMatchObject({ box: { __runespect: 'dehydrated' } });
});
