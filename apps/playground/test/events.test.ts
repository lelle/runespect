import { test, expect } from 'vitest';
import { createEventLog, EVENT_LIMIT, mergeEvents } from '@runespect/agent/protocol/internal';

test('an event carries where it happened, what happened, and when', () => {
  const log = createEventLog('relay');
  const ev = log.record('tx', { kind: 'tree', nodes: 44 });

  expect(ev).toMatchObject({ hop: 'relay', ev: 'tx', kind: 'tree', nodes: 44, seq: 0 });
  expect(typeof ev.t).toBe('number');
  expect(log.events).toEqual([ev]);
});

test('seq increments per hop, so gaps reveal what was never recorded', () => {
  const log = createEventLog('panel');
  log.record('connect');
  log.record('rx', { kind: 'tree' });

  expect(log.events.map((e) => e.seq)).toEqual([0, 1]);
});

test('the buffer is bounded — a long session keeps the recent past, not all of it', () => {
  const log = createEventLog('agent', 3);
  for (let i = 0; i < 5; i++) log.record('tx', { kind: String(i) });

  expect(log.events.map((e) => e.kind)).toEqual(['2', '3', '4']);
  expect(log.events.map((e) => e.seq)).toEqual([2, 3, 4]); // seq keeps counting past the window
});

test('since(seq) returns only what is new — how an agent or a test polls', () => {
  const log = createEventLog('panel-port');
  log.record('connect');
  const mark = log.events.at(-1)!.seq;
  log.record('reconnect', { attempt: 1 });

  expect(log.since(mark).map((e) => e.ev)).toEqual(['reconnect']);
  expect(log.since(999)).toEqual([]);
});

test('dump() is a JSON string, so a whole session can be pasted into a report', () => {
  const log = createEventLog('agent');
  log.record('drop', { kind: 'ops', error: 'DataCloneError' });

  const parsed = JSON.parse(log.dump());
  expect(parsed.hop).toBe('agent');
  expect(parsed.events[0]).toMatchObject({ ev: 'drop', error: 'DataCloneError' });
});

test('events from several hops merge into one timeline ordered by time', () => {
  const a = createEventLog('agent');
  const b = createEventLog('panel');
  const first = { ...a.record('tx', { kind: 'tree' }), t: 10 };
  const second = { ...b.record('rx', { kind: 'tree' }), t: 20 };

  expect(mergeEvents([second], [first]).map((e) => e.hop)).toEqual(['agent', 'panel']);
});

test('the default buffer is bounded to a size that stays cheap to mirror', () => {
  const log = createEventLog('agent');
  for (let i = 0; i < EVENT_LIMIT + 10; i++) log.record('tx');
  expect(log.events).toHaveLength(EVENT_LIMIT);
});
