import { untrack } from 'svelte';
import {
  dehydrate,
  diffOps,
  indexById,
  opFor,
  readLive,
  type Commit,
  type SerializedNode,
  type TreeOp,
} from './protocol/internal';
import {
  allInOrder,
  bump,
  find,
  setWatching,
  startReadingAll,
  takeChanges,
  trackVersion,
  writableSymbols,
  type InspectNode,
} from './tree.svelte';
import { recordCommit } from './history';

export const WIRE_DEPTH = 1;

// The whole tree only when a listener asks for it: a transport needs it once, for its first message.
type FlushListener = (tree: () => SerializedNode[], ops: TreeOp[], commit: Commit | null) => void;

// One watcher per page, however many transports are connected: the plugin connects both the window
// and the HMR channel, and a flush is still one thing that happened. It is diffed and recorded
// once, and every transport stamps its delta with the same commit.
const flushListeners = new Set<FlushListener>();

let stopWatching: (() => void) | null = null;

export function watchFlushes(listener: FlushListener): () => void {
  flushListeners.add(listener);
  if (stopWatching) {
    bump(); // the watcher only reruns on a change, and a new transport needs its first tree now
  } else {
    // The tree as it is now, so a change before the first flush is a change and not the baseline.
    let last: Map<number, SerializedNode> | null = indexById(untrack(() => serialize(WIRE_DEPTH)));
    setWatching(true);
    stopWatching = $effect.root(() => {
      $effect(() => {
        trackVersion();
        const changes = takeChanges();
        let ops: TreeOp[] = [];
        let commit: Commit | null = null;
        if (!last || changes.everything) {
          const current = serialize(WIRE_DEPTH);
          if (last) ops = diffOps(last, current);
          // Stamped on the delta, so a panel can build the same history from the stream it receives.
          if (last && ops.length) commit = recordCommit(last, ops);
          last = indexById(current);
        } else {
          ops = changedOps(last, changes);
          if (ops.length) commit = recordCommit(last, ops);
          for (const op of ops) {
            if (op.op === 'remove') last.delete(op.id);
            else last.set(op.node.id, op.node);
          }
        }
        const tree = last;
        for (const flush of flushListeners) flush(() => [...tree.values()], ops, commit);
      });
    });
  }
  return () => {
    flushListeners.delete(listener);
    if (flushListeners.size || !stopWatching) return;
    stopWatching();
    stopWatching = null;
    setWatching(false);
  };
}

// Clone-safe snapshot of the whole tree for transport to a panel that has no access to the live
// store (e.g. a browser-extension devtools panel). `depth` bounds value serialization: the wire
// uses depth 1 (lazy — deep values become dehydrated markers, fetched on demand); the in-process
// overlay uses the default (full depth, since there's no transport cost). Stored values are
// snapshots, except a value that holds functions or class instances (a services bag, a store): snap()
// keeps that one as the app's live object, so reading it here reads the app.
export function serialize(depth: number = Infinity): SerializedNode[] {
  trackVersion(); // consumers (overlay $derived, broadcast $effect) re-run on bump
  return allInOrder().map((n) => serializeNode(n, depth));
}

export function serializeNode(n: InspectNode, depth: number): SerializedNode {
  return {
    id: n.id,
    name: n.name,
    parent: n.parent,
    children: n.children.slice(),
    snippets: n.snippets.slice(),
    values: Object.fromEntries(Object.entries(n.values).map(([k, v]) => [k, dehydrate(v, depth)])),
    writable: writableSymbols(n.id),
    ...(n.kinds ? { kinds: { ...n.kinds } } : {}),
    ...(n.loc ? { loc: n.loc } : {}),
  };
}

// The ops for what changed since the last diff, looking only at the nodes marked since then. Ids
// grow with every enter, so sorting them keeps the order a whole-tree diff would give.
function changedOps(
  last: Map<number, SerializedNode>,
  changes: { dirty: number[]; removed: number[] },
): TreeOp[] {
  const ops: TreeOp[] = [];
  for (const id of changes.removed) if (last.has(id)) ops.push({ op: 'remove', id });
  for (const id of changes.dirty) {
    const n = find(id);
    if (!n) continue;
    const op = opFor(last.get(id), serializeNode(n, WIRE_DEPTH));
    if (op) ops.push(op);
  }
  return ops;
}

// Lazy-inspect reply: the (depth-1) subtree at `path`, fetched from the full stored value.
export function inspectPath(id: number, path: (string | number)[], limit?: number): unknown {
  const n = find(id);
  if (!n || !path.length) return undefined;
  const top = n.values[String(path[0])];
  let sub: unknown;
  try {
    sub = readLive(top, path.slice(1));
  } catch {
    return undefined; // a getter on the path threw; the field itself already shows the error
  }
  if (sub === undefined) return undefined;
  return dehydrate(sub, 1, { expandInstance: true, limit });
}

let stopRecording: (() => void) | null = null;

/**
 * Start reading the app's values and recording their history: what a panel opening does. Every
 * value is read once now, so the tree a panel gets next is complete, and again whenever it changes.
 * Idempotent.
 */
export function activate(): void {
  if (!startReadingAll()) return;
  stopRecording = watchFlushes(() => {});
}

export function resetWire(): void {
  stopRecording?.();
  stopRecording = null;
}
