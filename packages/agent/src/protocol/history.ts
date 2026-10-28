import type { SerializedNode, TreeOp } from './index.ts';

// State history ("what changed, when").
//
// The wire carries a delta per flush, and history keeps them. A commit is one flush: everything
// that changed together, which is what makes it possible to see that `count` and `doubled` moved
// as one thing and not as two coincidences.
//
// This is pure and lives in the protocol because BOTH sides compute it: the agent to fill its ring
// (for the backlog a panel asks for when it connects), and the panel for commits that arrive live.
// The duplication is deliberate and it is not free — it is what keeps previous values off the wire,
// since an ops message carries only the new state. The cost is that the two sides derive from their
// own view of the tree; sharing this function is what keeps the derivation itself identical.

export interface Change {
  op: 'update' | 'add' | 'remove';
  id: number;
  name: string;
  /** The value that changed. Absent for a component mount/unmount. */
  symbol?: string;
  from?: unknown;
  to?: unknown;
}

/** How many commits the agent keeps, and the panel shows. One bound, one place. */
export const HISTORY_COMMITS = 200;

export interface Commit {
  /** Monotonic per session; also stamped on the ops message that produced it. */
  seq: number;
  t: number;
  changes: Change[];
}

// Values are compared by content: an object rebuilt with equal contents is not a change to a
// reader, even though it is a new reference. The values are already depth-1 dehydrated by the time
// they reach here, so this stays cheap.
// Identity first: this runs for every reported value of every changed node on every flush, inside
// the user's app, and primitives keep identity through dehydrate(). Only containers pay the
// serialization.
const same = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

export function commitFromOps(
  prev: Map<number, SerializedNode>,
  ops: TreeOp[],
  seq: number,
  t: number,
): Commit {
  const changes: Change[] = [];
  for (const op of ops) {
    if (op.op === 'remove') {
      changes.push({ op: 'remove', id: op.id, name: prev.get(op.id)?.name ?? '?' });
      continue;
    }
    if (op.op === 'add') {
      changes.push({ op: 'add', id: op.node.id, name: op.node.name });
      continue;
    }
    const before = prev.get(op.node.id);
    const keys = new Set([...Object.keys(before?.values ?? {}), ...Object.keys(op.node.values)]);
    for (const symbol of keys) {
      const from = before?.values[symbol];
      const to = op.node.values[symbol];
      if (same(from, to)) continue;
      changes.push({ op: 'update', id: op.node.id, name: op.node.name, symbol, from, to });
    }
  }
  return { seq, t, changes };
}
