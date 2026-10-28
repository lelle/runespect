import {
  applyOps,
  commitFromOps,
  indexById,
  writeEncoded,
  type Commit,
  type SerializedNode,
  type Step,
  type TreeOp,
} from '@runespect/agent/protocol/internal';

// The tree the panel holds. The page sends values to depth 1, and the panel fetches deeper ones as
// the user expands them. What the page sent and what the panel fetched are kept apart: history and
// flashing compare what was sent, and only the view joins the two. Joined in one tree, a
// fetched value would look changed against the page's next marker for it.

/** One expanded value: where it is, how many entries were asked for, and the reply once it came. */
export interface Fetch {
  readonly id: number;
  /** [symbol, ...steps] */
  readonly path: readonly Step[];
  readonly limit?: number;
  readonly value?: unknown;
}

export interface Held {
  /** What the page sent. Anything that compares values reads this, never `shown`. */
  readonly sent: readonly SerializedNode[];
  readonly fetched: readonly Fetch[];
}

export type HeldEvent =
  | { type: 'tree'; nodes: SerializedNode[] }
  | { type: 'ops'; ops: TreeOp[]; commit?: number; t: number }
  | { type: 'asked'; id: number; path: readonly Step[]; limit?: number }
  | { type: 'hydrate'; id: number; path: readonly Step[]; value: unknown };

export interface HeldStep {
  state: Held;
  /** The history entry for an update that carries a commit number. */
  commit: Commit | null;
}

export const EMPTY: Held = { sent: [], fetched: [] };

export function hold(held: Held, event: HeldEvent): HeldStep {
  const step = (state: Held, commit: Commit | null = null): HeldStep => ({ state, commit });
  switch (event.type) {
    case 'tree': {
      const present = new Set(event.nodes.map((n) => n.id));
      const fetched = held.fetched.filter((f) => present.has(f.id)).map(withoutValue);
      return step({ sent: event.nodes, fetched });
    }
    case 'ops': {
      // Computed before the ops apply, against what the page sent last.
      const commit =
        event.commit == null
          ? null
          : commitFromOps(indexById([...held.sent]), event.ops, event.commit, event.t);
      const removed = new Set(event.ops.flatMap((op) => (op.op === 'remove' ? [op.id] : [])));
      const changed = new Set(event.ops.map((op) => (op.op === 'remove' ? op.id : op.node.id)));
      const fetched = held.fetched
        .filter((f) => !removed.has(f.id))
        .map((f) => (changed.has(f.id) ? withoutValue(f) : f));
      return step({ sent: applyOps([...held.sent], event.ops), fetched }, commit);
    }
    case 'asked': {
      const known = held.fetched.find((f) => f.id === event.id && samePath(f.path, event.path));
      if (!known) {
        const ask: Fetch = { id: event.id, path: event.path, limit: event.limit };
        return step({ ...held, fetched: [...held.fetched, withoutUndefined(ask)] });
      }
      if (!event.limit || event.limit <= (known.limit ?? 0)) return step(held);
      return step({
        ...held,
        fetched: replace(held.fetched, known, { ...known, limit: event.limit }),
      });
    }
    case 'hydrate': {
      const known = held.fetched.find((f) => f.id === event.id && samePath(f.path, event.path));
      if (!known) return step(held);
      return step({
        ...held,
        fetched: replace(held.fetched, known, { ...known, value: event.value }),
      });
    }
  }
}

/**
 * What the page sent, with each reply spliced in, in the order asked, so a value expanded inside a
 * fetched one lands inside it. `read` is the overlay's: it is in the page, so it reads every
 * expanded value afresh instead of keeping replies.
 */
export function shown(
  held: Held,
  read?: (id: number, path: Step[], limit?: number) => unknown,
): SerializedNode[] {
  if (!held.fetched.length) return [...held.sent];
  return held.sent.map((n) => {
    let values = n.values;
    for (const f of held.fetched) {
      if (f.id !== n.id) continue;
      const value = read ? read(f.id, [...f.path], f.limit) : f.value;
      if (value !== undefined) values = writeEncoded(values, f.path, value) as typeof values;
    }
    return values === n.values ? n : { ...n, values };
  });
}

function withoutValue(f: Fetch): Fetch {
  if (!('value' in f)) return f;
  const { value: _, ...ask } = f;
  return ask;
}

function withoutUndefined(f: Fetch): Fetch {
  return f.limit === undefined ? { id: f.id, path: f.path } : f;
}

const samePath = (a: readonly Step[], b: readonly Step[]): boolean =>
  a.length === b.length && a.every((s, i) => s === b[i]);

const replace = (all: readonly Fetch[], old: Fetch, next: Fetch): Fetch[] =>
  all.map((f) => (f === old ? next : f));
