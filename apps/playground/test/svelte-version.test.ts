import { test, expect } from 'vitest';
import { atLeast } from './svelte-version';

test('versions compare part by part, not as text', () => {
  expect(atLeast('5.57.0', '5.57.0')).toBe(true);
  expect(atLeast('5.100.0', '5.57.0')).toBe(true);
  expect(atLeast('5.20.5', '5.57.0')).toBe(false);
  expect(atLeast('5.56.10', '5.57.0')).toBe(false);
  expect(atLeast('6.0.0', '5.57.0')).toBe(true);
});
