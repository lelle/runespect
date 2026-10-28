// Pure split-resize math for <Split>'s draggable divider. Keeping the geometry here
// (no DOM) makes the clamping unit-testable; the component just feeds it the pointer position.

export const SPLIT_MIN = 20;
export const SPLIT_MAX = 80;

// Bound a tree-pane width percentage so neither pane collapses.
export function clampSplit(pct: number): number {
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, pct));
}

// The tree-pane width as a % of the split container, from the pointer's clientX. width <= 0 (e.g.
// an unmeasured container) falls back to the minimum rather than dividing by zero.
export function splitPercent(clientX: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_MIN;
  return clampSplit(((clientX - left) / width) * 100);
}
