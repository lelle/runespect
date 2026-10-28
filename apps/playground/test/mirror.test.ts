import { test, expect } from 'vitest';
import { createEventLog, type RunespectEvent } from '@runespect/agent/protocol/internal';
import { createMirror } from '../../../packages/extension/src/mirror';

// How a hop's event log reaches the page: one rule, two ways to deliver it. Fresh sends a receiver
// only what it has not had, for a receiver that lives exactly as long as the hop. Whole sends every
// buffer each time, for a receiver that can be replaced under it; the agent drops what it already
// has.

function mirrored(deliver: 'fresh' | 'whole') {
  const sent: RunespectEvent[][] = [];
  const queued: (() => void)[] = [];
  const mirror = createMirror({
    send: (events) => sent.push(events),
    deliver,
    schedule: (flush) => queued.push(flush),
  });
  const burst = (): void => queued.splice(0).forEach((flush) => flush());
  const kinds = () => sent.map((batch) => batch.map((e) => `${e.hop}:${e.ev}`));
  return { mirror, sent, burst, kinds };
}

test('a burst of records is sent once', () => {
  const { mirror, sent, burst } = mirrored('fresh');
  const log = mirror.log('relay');
  log.record('tx');
  log.record('rx');
  burst();

  expect(sent).toHaveLength(1);
  expect(sent[0].map((e) => e.ev)).toEqual(['tx', 'rx']);
});

test('fresh sends only what the receiver has not had', () => {
  const { mirror, burst, kinds } = mirrored('fresh');
  const log = mirror.log('relay');
  log.record('tx');
  burst();
  log.record('rx');
  burst();

  expect(kinds()).toEqual([['relay:tx'], ['relay:rx']]);
});

test('whole resends every buffer, its own, the ones it includes and the one it carries', () => {
  const { mirror, burst, kinds } = mirrored('whole');
  const own = mirror.log('panel');
  const port = createEventLog('panel-port');
  mirror.include(() => port.events);
  port.record('connect');
  own.record('connect');
  burst();
  mirror.carry([{ t: 1, seq: 0, hop: 'background', ev: 'drop' }]);
  burst();
  own.record('rx');
  burst();

  expect(kinds()).toEqual([
    ['panel:connect', 'panel-port:connect'],
    ['panel:connect', 'panel-port:connect', 'background:drop'],
    ['panel:connect', 'panel:rx', 'panel-port:connect', 'background:drop'],
  ]);
});

test('a carried log replaces the one carried before', () => {
  const { mirror, burst, kinds } = mirrored('whole');
  mirror.carry([{ t: 1, seq: 0, hop: 'background', ev: 'drop' }]);
  burst();
  mirror.carry([{ t: 2, seq: 0, hop: 'background', ev: 'connect' }]);
  burst();

  expect(kinds()).toEqual([['background:drop'], ['background:connect']]);
});

// An included log changes without the mirror hearing of it; whoever records there pokes.
test('a poke sends what an included log recorded', () => {
  const { mirror, burst, kinds } = mirrored('fresh');
  const shared = createEventLog('background');
  mirror.include(() => shared.events);
  shared.record('drop');
  mirror.poke();
  burst();
  shared.record('drop');
  mirror.poke();
  burst();

  expect(kinds()).toEqual([['background:drop'], ['background:drop']]);
});

test('nothing new is nothing sent', () => {
  const { mirror, sent, burst } = mirrored('fresh');
  mirror.log('relay').record('tx');
  burst();
  mirror.poke();
  burst();

  expect(sent).toHaveLength(1);
});

// The extension was reloaded under an open context: every send throws from now on.
test('a send that throws stops the mirror for good', () => {
  let calls = 0;
  const queued: (() => void)[] = [];
  const mirror = createMirror({
    send: () => {
      calls++;
      throw new Error('Extension context invalidated.');
    },
    deliver: 'whole',
    schedule: (flush) => queued.push(flush),
  });
  const log = mirror.log('panel');
  log.record('connect');
  queued.splice(0).forEach((flush) => flush());
  log.record('rx');
  mirror.poke();
  queued.splice(0).forEach((flush) => flush());

  expect(calls).toBe(1);
  expect(mirror.dead).toBe(true);
});
