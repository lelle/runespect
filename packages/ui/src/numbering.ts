import type { FromSource } from '@runespect/agent/protocol/internal';

// Every message a page sends carries `n`, one more than the last its connection sent. The panel
// keeps the last per page, so a number skipped is a message lost on the way. The first number heard
// from a page is where the panel starts: a panel that opened late has missed nothing it could ask
// for.

/** How many times the panel asks a page for its tree after gaps, until a tree comes. */
export const REPAIR_ATTEMPTS = 3;

/** The last number heard from each page, by its `from`. */
export type Numbers = ReadonlyMap<string, number>;

export interface Gap {
  from: string;
  expected: number;
  got: number;
}

export interface NumberStep {
  numbers: Numbers;
  gap: Gap | null;
  /** Heard before, or out of order: the message is older than what the panel already has. */
  stale: boolean;
}

export function hearNumber(numbers: Numbers, msg: FromSource): NumberStep {
  const { from, n } = msg;
  if (!from || n === undefined) return { numbers, gap: null, stale: false };
  const last = numbers.get(from);
  const next = new Map(numbers);
  // A page that connects again counts from 1.
  if (last === undefined || n === last + 1 || n === 1) {
    return { numbers: next.set(from, n), gap: null, stale: false };
  }
  const gap = { from, expected: last + 1, got: n };
  if (n <= last) return { numbers, gap, stale: true };
  return { numbers: next.set(from, n), gap, stale: false };
}

/**
 * onGap for a panel that has a console of its own (the panel window): warns once per page. <Panel>
 * itself warns in no console, since it can run inside the inspected page, whose console is the app's.
 */
export function gapWarner(warn: (message: string) => void): (gap: Gap) => void {
  const warned = new Set<string>();
  return (gap) => {
    if (warned.has(gap.from)) return;
    warned.add(gap.from);
    warn(
      `[runespect] lost or reordered messages from page ${gap.from} (expected ${gap.expected}, got ${gap.got}); asked it for its tree again`,
    );
  };
}
