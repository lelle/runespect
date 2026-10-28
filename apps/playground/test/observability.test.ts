import { test, expect, beforeEach, afterEach } from 'vitest';
import * as agent from '@runespect/agent/internal';
import type { RunespectEvent } from '@runespect/agent/protocol/internal';

let stop: (() => void) | undefined;
beforeEach(() => {
  agent.reset();
  delete (globalThis as { __runespect?: unknown }).__runespect;
});
afterEach(() => {
  stop?.();
  stop = undefined;
});

const surface = () =>
  (globalThis as unknown as { __runespect: { events: RunespectEvent[]; dump(): string } })
    .__runespect;

test('connecting publishes the event surface on the page', () => {
  stop = agent.connect({ send: () => {}, onMessage: () => () => {} });

  expect(surface().events.map((e) => [e.hop, e.ev, e.kind])).toEqual([
    ['agent', 'connect', undefined],
    ['agent', 'tx', 'hello'],
  ]);
});

test('every message the agent sends is recorded with its kind — the chain becomes readable', () => {
  stop = agent.connect({ send: () => {}, onMessage: () => () => {} });

  const kinds = surface()
    .events.filter((e) => e.ev === 'tx')
    .map((e) => e.kind);
  expect(kinds).toEqual(['hello']); // the tier announcement
});

// A value the wire refuses is recorded, instead of surfacing only as an uncaught DataCloneError in
// the app's own console.
test('a refused send is recorded as a drop, with the reason', () => {
  stop = agent.connect({
    send: () => {
      throw new DOMException('could not be cloned', 'DataCloneError');
    },
    onMessage: () => () => {},
  });

  const [connected, drop, ...rest] = surface().events;
  expect([connected.ev, drop.ev, drop.kind, rest]).toEqual(['connect', 'drop', 'hello', []]);
  expect(String(drop.error)).toContain('DataCloneError');
});

test('the surface exposes since() and dump() for polling and for bug reports', () => {
  stop = agent.connect({ send: () => {}, onMessage: () => () => {} });
  const api = surface() as unknown as {
    since(seq: number): RunespectEvent[];
    dump(): string;
    events: RunespectEvent[];
  };

  expect(api.since(-1).length).toBe(api.events.length);
  expect(JSON.parse(api.dump()).events.length).toBe(api.events.length);
});

test('events from other hops can be merged in, so one timeline covers the whole chain', () => {
  stop = agent.connect({ send: () => {}, onMessage: () => () => {} });
  const api = globalThis as unknown as {
    __runespect: { absorb(events: RunespectEvent[]): void; events: RunespectEvent[] };
  };

  api.__runespect.absorb([{ t: Date.now(), seq: 0, hop: 'panel-port', ev: 'reconnect' }]);

  expect(api.__runespect.events.some((e) => e.hop === 'panel-port')).toBe(true);
});

// The relay cannot reach window.__runespect from the isolated world, so it posts its buffer to the
// main world. The agent is what listens there — without this the chain's middle hop stays dark.
test('the agent absorbs the event buffers other hops post into the page', async () => {
  stop = agent.broadcast();
  window.postMessage(
    {
      source: 'runespect',
      kind: 'events',
      events: [{ t: Date.now(), seq: 0, hop: 'relay', ev: 'tx', kind: 'tree' }],
    },
    '*',
  );
  await new Promise((r) => setTimeout(r, 0)); // window 'message' is async

  expect(surface().events.some((e) => e.hop === 'relay')).toBe(true);
});
