import { test, expect } from 'vitest';
import {
  eventsMessage,
  helloMessage,
  isControl,
  registerMessage,
  PROTOCOL_VERSION,
} from '@runespect/agent/protocol/internal';

// Two messages travel the runespect channels without being part of the conversation about the tree:
// a hop's event log on its way to the page, and a devtools panel naming its tab to the service
// worker. Every hop tells them apart from the conversation the same way.

const event = { t: 0, seq: 0, hop: 'relay' as const, ev: 'tx' as const, kind: 'tree' };

test('the event log and the registration are control messages', () => {
  expect(isControl(eventsMessage([event]))).toBe(true);
  expect(isControl(registerMessage(7))).toBe(true);
});

test('a message of the conversation is not a control message', () => {
  expect(isControl(helloMessage(PROTOCOL_VERSION, 0))).toBe(false);
});

test('a control message that is not runespect’s, or not whole, is not one', () => {
  expect(isControl({ kind: 'events', events: [event] })).toBe(false);
  expect(isControl({ ...eventsMessage([]), events: 'many' })).toBe(false);
  expect(isControl({ ...registerMessage(7), tabId: '7' })).toBe(false);
  expect(isControl(null)).toBe(false);
});
