import { test, expect, beforeEach, afterEach } from 'vitest';
import * as agent from '@runespect/agent/internal';
import { editMessage } from '@runespect/agent/protocol/internal';
import type { Message } from '@runespect/agent/protocol/internal';

// One dev server is one channel, so a panel's commands reach every page on it — not just the page
// it follows. Measured: an edit from the panel window changed the counter in BOTH open tabs.
// Messages the panel addresses to a page are therefore ignored by every other page.
let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
});

function connected() {
  const sent: Message[] = [];
  let listener: ((m: Message) => void) | undefined;
  stop = agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      listener = cb;
      return () => (listener = undefined);
    },
  });
  const id = agent.enter('Counter');
  agent.report(id, 'count', 1);
  // An edit goes through the binder the instrumentation registers, so register one by hand.
  agent.bind(id, 'count', (v) => agent.report(id, 'count', v));
  const self = (sent.find((m) => m.kind === 'hello') as { from?: string } | undefined)?.from;
  return { id, self, emit: (m: Message) => listener?.(m) };
}

test('an edit addressed to this page is applied', () => {
  const { id, self, emit } = connected();

  emit({ ...editMessage(id, 'count', 42), to: self });

  expect(agent.read(id, 'count')).toBe(42);
});

test('an edit addressed to another page is ignored', () => {
  const { id, emit } = connected();

  emit({ ...editMessage(id, 'count', 99), to: 'some-other-page' });

  expect(agent.read(id, 'count')).toBe(1); // untouched
});

test('an unaddressed command still works — the extension routes by tab, not by page id', () => {
  const { id, emit } = connected();

  emit(editMessage(id, 'count', 7));

  expect(agent.read(id, 'count')).toBe(7);
});
