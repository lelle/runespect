import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as agent from '@runespect/agent/internal';

beforeEach(() => agent.reset());
afterEach(() => vi.unstubAllGlobals());

test('agent mutations are no-ops on the server (no document) — nothing accumulates', () => {
  vi.stubGlobal('document', undefined); // simulate SSR

  const id = agent.enter('Comp', null);
  agent.bind(id, 'x', () => {});
  agent.report(id, 'x', 1);

  expect(id).toBe(-1);
  expect(agent.allNodes()).toHaveLength(0);
});

test('client behaviour is unaffected when document is present', () => {
  const id = agent.enter('Comp', null);
  expect(id).toBeGreaterThan(0);
  expect(agent.allNodes()).toHaveLength(1);
});
