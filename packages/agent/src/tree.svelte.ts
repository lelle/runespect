// The agent's tree: the nodes, how their values are read, and how they are edited. The node store
// is PLAIN; UI reactivity comes from a single $state `version` signal that mutators bump and
// `serialize()` reads. We do NOT make the store deeply reactive ($state): under Svelte's HMR
// re-render flush, writes to a deeply-reactive module-level array (the `push` of a newly-entered
// node) can be silently dropped, which would leave the devtools tree stale and unreactive after an
// edit. A plain store can't be corrupted that way. Binders are kept outside any reactive store (plain
// setter functions).
import { errorValue, isPlainObject, isRoot, type SymbolKind } from './protocol/internal';
import { snap, track } from './snap.svelte';

/** A node as the agent tracks it in the live store. */
export interface InspectNode {
  id: number;
  name: string;
  parent: number | null;
  children: number[];
  values: Record<string, unknown>;
  snippets: string[];
  /** Per-symbol category for grouping in the detail pane. */
  kinds?: Record<string, SymbolKind>;
  /** Optional source location "file" or "file:line" for open-in-editor. */
  loc?: string;
}

// The tree lives in this module's state, so a second copy of the agent (two versions installed, or
// one bundled into a dependency) splits it without a sound: components report to whichever copy
// they imported. Say so the moment it happens.
const LOADED = Symbol.for('runespect.agent');
if (typeof document !== 'undefined') {
  const g = globalThis as { [LOADED]?: boolean };
  if (g[LOADED]) {
    console.warn(
      '[runespect] a second copy of the agent was loaded; components will be split between them. ' +
        'Check that only one version of @runespect/agent is installed.',
    );
  }
  g[LOADED] = true;
}
// Reactivity trigger for consumers (overlay $derived, broadcast $effect) via serialize().
// bump() must NOT read `version` — that would make every report effect depend on it and loop —
// so it advances a plain counter and assigns that. It assigns only once until a consumer has read
// the new value: in dev, Svelte takes a stack trace for every set after the fifth in one flush, and
// one set per reported value would make that thousands per flush.
let tick = 0;
let version = $state(0);
let unread = false;
export const bump = (): void => {
  if (unread) return;
  unread = true;
  version = ++tick;
};
let watching = false;
// Marked only while the watcher runs: without one nobody reads the marks, and its first run diffs
// everything anyway.
const mark = (id: number): void => {
  if (watching) registry.dirty.add(id);
};
const changed = (id: number): void => {
  mark(id);
  bump();
};

// Each part of the agent keeps its plain data in one object, and reset() replaces it with a fresh
// one: a field added here is reset without anyone remembering to.
const freshRegistry = () => ({
  // The node store. A Map keeps insertion order, which is id order, which is mount order: the order
  // the tree, serialize() and the picker list nodes in. Every report looks its node up by id; a scan
  // of a list would make a flush, and an unmount of many components, quadratic in the tree size.
  byId: new Map<number, InspectNode>(),
  seq: 0,
  // State in a .svelte.ts module has no component to hang from, so every module joins one "Modules"
  // root.
  modulesRoot: null as number | null,
  // What changed since the watcher last diffed, so a flush looks at those nodes and not the whole
  // tree.
  dirty: new Set<number>(),
  removed: new Set<number>(),
  everything: true,
});
let registry = freshRegistry();
export const allInOrder = (): InspectNode[] => [...registry.byId.values()];
export const find = (id: number): InspectNode | undefined => registry.byId.get(id);

// On the server (SSR) there is no UI and effects never run, so registering would
// just leak nodes across requests. Mutations are no-ops there. Checked per call so
// it stays correct (and testable) rather than frozen at module load.
export const onServer = (): boolean => typeof document === 'undefined';

export function enter(
  name: string,
  parent?: number | null,
  meta: { snippets?: string[]; loc?: string; kinds?: Record<string, SymbolKind> } = {},
): number {
  if (onServer()) return -1;
  const id = ++registry.seq;
  const node: InspectNode = {
    id,
    name,
    parent: parent ?? null,
    children: [],
    values: {},
    snippets: meta.snippets ?? [],
    ...(meta.kinds ? { kinds: meta.kinds } : {}),
    ...(meta.loc ? { loc: meta.loc } : {}),
  };
  registry.byId.set(id, node);
  const p = parent != null ? find(parent) : null;
  if (p) {
    p.children.push(id);
    mark(p.id);
  }
  changed(id);
  return id;
}

// A module that runs again (HMR) replaces its node rather than leaving a frozen copy behind.
export function enterModule(
  loc: string,
  meta: { kinds?: Record<string, SymbolKind> } = {},
): number {
  if (onServer()) return -1;
  for (const n of allInOrder()) if (n.loc === loc && n.parent === registry.modulesRoot) leave(n.id);
  if (registry.modulesRoot == null || !find(registry.modulesRoot))
    registry.modulesRoot = enter('Modules', null);
  return enter(loc.split(/[\\/]/).pop()!, registry.modulesRoot, { loc, ...meta });
}

// Fully remove the node on unmount: drop it from the tree, detach it from its
// parent's children, and discard its binders. Keeps HMR / mount churn from leaking
// orphaned nodes.
export function leave(id: number): void {
  if (onServer()) return;
  const node = find(id);
  if (!node) return;
  registry.byId.delete(id);
  if (node.parent != null) {
    const parent = find(node.parent);
    const ci = parent?.children.indexOf(id) ?? -1;
    if (ci !== -1) parent?.children.splice(ci, 1);
    if (parent) mark(parent.id);
  }
  stopReading(id);
  unwatchStores(id);
  reading.binders.delete(id);
  reading.readers.delete(id);
  registry.dirty.delete(id);
  if (watching) registry.removed.add(id);
  bump();
}

// ── lazy inspection ──

export function report(id: number, symbol: string, value: unknown): void {
  if (onServer()) return;
  const n = find(id);
  if (n) {
    n.values[symbol] = value;
    changed(id);
  }
}

// Until a panel opens, the agent reads none of the app's values: reading one evaluates it, and a
// $derived the app itself never reads would then run on every change. The injected code only hands
// over how to read each value; the first panel to ask starts reading them, for the page's lifetime.
const freshReading = () => ({
  active: false,
  binders: new Map<number, Map<string, (v: unknown) => void>>(), // id -> Map(symbol -> setter)
  readers: new Map<number, Map<string, () => unknown>>(), // id -> Map(symbol -> live read)
  stops: new Map<number, (() => void)[]>(), // id -> what stops reading its values
  storeWatches: new Map<number, Map<string, StoreWatch>>(), // id -> Map(symbol -> watch)
});
let reading = freshReading();

// A value that throws (a derived only valid behind a guard) is reported as that error instead of
// breaking the component it instruments.
function readValue(read: () => unknown): unknown {
  try {
    const value = read();
    track(value);
    return snap(value);
  } catch (error) {
    return errorValue(error);
  }
}

function startReading(id: number, symbol: string, read: () => unknown): void {
  const stop = $effect.root(() => {
    $effect(() => report(id, symbol, readValue(read)));
  });
  reading.stops.set(id, [...(reading.stops.get(id) ?? []), stop]);
}

function stopReading(id: number): void {
  for (const stop of reading.stops.get(id) ?? []) stop();
  reading.stops.delete(id);
}

export function reportFrom(id: number, symbol: string, read: () => unknown): void {
  if (onServer()) return;
  let symbols = reading.readers.get(id);
  if (!symbols) reading.readers.set(id, (symbols = new Map()));
  symbols.set(symbol, read);
  if (reading.active) startReading(id, symbol, read);
}

export interface Subscribable {
  subscribe(run: (value: unknown) => void): (() => void) | { unsubscribe(): void };
}

interface StoreWatch {
  store: Subscribable;
  unsubscribe: (() => void) | null;
}

function subscribeWatch(id: number, symbol: string, watch: StoreWatch): void {
  const subscription = watch.store.subscribe((value) => report(id, symbol, snap(value)));
  watch.unsubscribe =
    typeof subscription === 'function' ? subscription : () => subscription.unsubscribe();
}

function unwatchStores(id: number): void {
  for (const watch of reading.storeWatches.get(id)?.values() ?? []) watch.unsubscribe?.();
  reading.storeWatches.delete(id);
}

// Reports a store through its own subscription, which needs neither `$effect` nor `$:` and so works in
// a component of either mode. Subscribes once a panel has asked. Returns the unsubscribe.
export function watchStore(id: number, symbol: string, store: Subscribable): () => void {
  if (onServer()) return () => {};
  const watch: StoreWatch = { store, unsubscribe: null };
  let watches = reading.storeWatches.get(id);
  if (!watches) reading.storeWatches.set(id, (watches = new Map()));
  watches.set(symbol, watch);
  if (reading.active) subscribeWatch(id, symbol, watch);
  return () => {
    watch.unsubscribe?.();
    watch.unsubscribe = null;
    if (reading.storeWatches.get(id)?.get(symbol) === watch)
      reading.storeWatches.get(id)?.delete(symbol);
  };
}

/** Start reading every value, now and on every change. False when the agent already reads them. */
export function startReadingAll(): boolean {
  if (reading.active || onServer()) return false;
  reading.active = true;
  for (const [id, symbols] of reading.readers) {
    for (const [symbol, read] of symbols) {
      report(id, symbol, readValue(read));
      startReading(id, symbol, read);
    }
  }
  for (const [id, watches] of reading.storeWatches) {
    for (const [symbol, watch] of watches) subscribeWatch(id, symbol, watch);
  }
  return true;
}

export function bind(id: number, symbol: string, setter: (v: unknown) => void): void {
  if (onServer()) return;
  let m = reading.binders.get(id);
  if (!m) reading.binders.set(id, (m = new Map()));
  m.set(symbol, setter);
  mark(id);
}

// An edit names the field it changes, and the rest of the value comes from the app's live value,
// never from the panel's copy: that copy holds markers in place of everything it did not load.
// Only the objects on the path are copied, so the root is reassigned and $state.raw updates too.
export function setValue(
  id: number,
  symbol: string,
  value: unknown,
  path: ReadonlyArray<string | number> = [],
): boolean {
  const set = reading.binders.get(id)?.get(symbol);
  if (!set || carriesMarker(value, new Set())) return false;
  if (!path.length) {
    set(value);
    return true;
  }
  const live = reading.readers.get(id)?.get(symbol)?.() ?? find(id)?.values[symbol];
  const next = withValueAt(live, path, value);
  if (next === REFUSED) return false;
  set(next);
  return true;
}

function carriesMarker(v: unknown, seen: Set<object>): boolean {
  if (v === null || typeof v !== 'object' || seen.has(v)) return false;
  seen.add(v);
  if ('__runespect' in v) return true;
  return Object.values(v).some((x) => carriesMarker(x, seen));
}

const REFUSED = Symbol('refused');

// Descends plain objects and arrays only: copying a class instance, a Map or a Set field by field
// would lose its prototype or its entries.
function withValueAt(root: unknown, path: ReadonlyArray<string | number>, value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const i = Number(head);
    const child = withValueAt(root[i], rest, value);
    if (child === REFUSED) return REFUSED;
    const copy = root.slice();
    copy[i] = child;
    return copy;
  }
  if (isPlainObject(root)) {
    const child = withValueAt(root[String(head)], rest, value);
    return child === REFUSED ? REFUSED : { ...root, [String(head)]: child };
  }
  return REFUSED;
}

/** The app's own value, read now. */
export function readLive(id: number, symbol: string): unknown {
  return reading.readers.get(id)?.get(symbol)?.();
}

export function read(id: number, symbol: string): unknown {
  return find(id)?.values[symbol];
}

export function isWritable(id: number, symbol: string): boolean {
  return reading.binders.get(id)?.has(symbol) ?? false;
}

export function getNode(id: number): InspectNode | null {
  return find(id) ?? null;
}

export function allNodes(): InspectNode[] {
  return allInOrder();
}

export function roots(): InspectNode[] {
  return allInOrder().filter((n) => isRoot(n, registry.byId));
}

/** Read the version signal, so the caller runs again when the tree changes. */
export function trackVersion(): void {
  void version;
  unread = false;
}

/** Whether a watcher diffs the tree: only then are changes marked. The next one starts from all of it. */
export function setWatching(on: boolean): void {
  watching = on;
  if (on) return;
  registry.everything = true;
  registry.dirty.clear();
  registry.removed.clear();
}

/** What changed since the last call, in id order, for the watcher's next diff. */
export function takeChanges(): { everything: boolean; dirty: number[]; removed: number[] } {
  const changes = {
    everything: registry.everything,
    dirty: [...registry.dirty].sort((a, b) => a - b),
    removed: [...registry.removed],
  };
  registry.everything = false;
  registry.dirty.clear();
  registry.removed.clear();
  return changes;
}

export function writableSymbols(id: number): string[] {
  return [...(reading.binders.get(id)?.keys() ?? [])];
}

export function resetTree(): void {
  for (const id of [...reading.stops.keys()]) stopReading(id);
  for (const id of [...reading.storeWatches.keys()]) unwatchStores(id);
  reading = freshReading();
  registry = freshRegistry();
  bump();
}
