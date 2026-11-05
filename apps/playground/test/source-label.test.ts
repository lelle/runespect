import { test, expect } from 'vitest';
import { lastSeenLabel, sourceDetails, sourceLabel } from '@runespect/ui/internal';

// How the panel names the pages it can follow, and how long ago each spoke.

test('a page is named by its path, else its title, else its id', () => {
  expect(sourceLabel({ id: 'a', url: '/cart', title: 'Cart', lastSeen: 0 })).toBe('/cart');
  expect(sourceLabel({ id: 'a', title: 'Cart', lastSeen: 0 })).toBe('Cart');
  expect(sourceLabel({ id: 'a', lastSeen: 0 })).toBe('a');
});

test('how long ago a page spoke: just now, then seconds, then minutes', () => {
  const at = (ms: number) => lastSeenLabel({ id: 'a', lastSeen: 0 }, ms);
  expect(at(2_000)).toBe('just now');
  expect(at(12_000)).toBe('12s ago');
  expect(at(59_000)).toBe('59s ago');
  expect(at(240_000)).toBe('4m ago');
  expect(at(-5_000)).toBe('just now'); // a clock that went back
});

// The second line of a row in the page list: what else tells two pages apart.
test("a page's details: its title, its tier and its agent version, as far as it said them", () => {
  expect(
    sourceDetails({ id: 'a', title: 'Shop', tier: 0, agentVersion: '0.2.0', lastSeen: 0 }),
  ).toBe('Shop · Live · v0.2.0');
  expect(sourceDetails({ id: 'a', title: 'Shop', tier: 2, lastSeen: 0 })).toBe('Shop · Capture');
  expect(sourceDetails({ id: 'a', lastSeen: 0 })).toBe('Names only');
});
