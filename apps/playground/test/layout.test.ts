import { test, expect } from 'vitest';
import { splitPercent, clampSplit, SPLIT_MIN, SPLIT_MAX } from '@runespect/ui/internal';

test('splitPercent: pane width % from the pointer position within the container', () => {
  expect(splitPercent(100, 0, 200)).toBe(50); // halfway
  expect(splitPercent(150, 100, 200)).toBe(25); // left offset: (150-100)/200
});

test('splitPercent: clamps so neither pane collapses', () => {
  expect(splitPercent(10, 0, 200)).toBe(SPLIT_MIN); // 5% → min
  expect(splitPercent(190, 0, 200)).toBe(SPLIT_MAX); // 95% → max
  expect(splitPercent(50, 0, 0)).toBe(SPLIT_MIN); // zero width → min (no divide-by-zero)
});

test('clampSplit: bounds a percentage to [min, max]', () => {
  expect(clampSplit(45)).toBe(45);
  expect(clampSplit(5)).toBe(SPLIT_MIN);
  expect(clampSplit(95)).toBe(SPLIT_MAX);
});
