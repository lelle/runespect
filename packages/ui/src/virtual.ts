// Fixed-height row windowing for the names-only component tree. Pure math, no DOM, so the
// window arithmetic is unit-testable; <Tree> feeds it the scroll offset and the measured viewport
// height and renders start..end with a spacer above and below. Hand-rolled rather than a virtual-
// list dependency: rows in the panel tree are one line each, so fixed-height windowing is enough.

/** Row height in px — must match the `.rs-row` height in <Tree>'s stylesheet. */
export const ROW_HEIGHT = 20;
/** Extra rows rendered outside the viewport, so a scroll doesn't expose blank space. */
export const OVERSCAN = 10;

export interface RowWindow {
  /** First rendered row index (inclusive). */
  start: number;
  /** Last rendered row index (exclusive). */
  end: number;
  /** Spacer height above the rendered rows, in px. */
  padTop: number;
  /** Spacer height below the rendered rows, in px. */
  padBottom: number;
}

// An unmeasured viewport (height <= 0: jsdom, or before the first layout) renders every row rather
// than nothing — windowing is an optimization, never a reason to show an empty tree.
export function windowRange(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = ROW_HEIGHT,
  overscan: number = OVERSCAN,
): RowWindow {
  if (viewportHeight <= 0 || total <= 0) {
    return { start: 0, end: Math.max(0, total), padTop: 0, padBottom: 0 };
  }
  const top = Math.max(0, scrollTop);
  const end = Math.min(total, Math.ceil((top + viewportHeight) / rowHeight) + overscan);
  // Clamped to `end` so a scroll offset past the content (the row count shrank under a collapse or
  // a filter, before the browser clamps scrollTop) yields an empty window, never a negative slice.
  const start = Math.min(end, Math.max(0, Math.floor(top / rowHeight) - overscan));
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (total - end) * rowHeight,
  };
}

// The scroll offset that brings row `index` just inside the viewport, or null when it is already
// visible (or the viewport is unmeasured). Keyboard navigation can move the selection far outside
// the rendered window, where scrollIntoView has no element to work with — this scrolls by index.
export function scrollTopForRow(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = ROW_HEIGHT,
): number | null {
  if (viewportHeight <= 0) return null;
  const top = index * rowHeight;
  if (top < scrollTop) return top;
  const bottom = top + rowHeight;
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
  return null;
}
