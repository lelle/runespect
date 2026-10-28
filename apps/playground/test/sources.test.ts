import { test, expect, beforeEach, afterEach } from 'vitest';
import * as agent from '@runespect/agent/internal';

let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
});

test('the agent says who it is, so a panel can tell two pages apart', () => {
  const sent: any[] = [];
  stop = agent.connect({ send: (m: any) => sent.push(m), onMessage: () => () => {} });

  const announced = sent.find((m) => m.kind === 'hello');
  expect(typeof announced.from).toBe('string'); // who
  expect(announced.from.length).toBeGreaterThan(0);
  expect(typeof announced.url).toBe('string'); // and what it is called
});
