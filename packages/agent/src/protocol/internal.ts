export { commitFromOps, HISTORY_COMMITS } from './history.ts';
export type { Commit, Change } from './history.ts';
import type { Commit } from './history.ts';
import type { RunespectEvent } from './events.ts';
export { createEventLog, mergeEvents, EVENT_LIMIT } from './events.ts';
export { dehydrate } from './dehydrate.ts';
export { compileMatcher, type Matcher } from './match.ts';
export { componentName } from './names.ts';
export { childStep, readLive, writeEncoded, type Step } from './valuePath.ts';
export type { DehydrateOptions } from './dehydrate.ts';
export type { RunespectEvent, EventLog, EventKind, Hop } from './events.ts';
// Shared contract between the agent and every UI (the overlay, the panel window, the extension).
// Kept transport-agnostic so the agent never depends on how the UI is delivered.

// Tag on every wire message so a shared channel (window.postMessage) can be filtered.
export const SOURCE = 'runespect';

// Bumped on a breaking wire-format change. Panel and page exchange it on connect (hello); a
// mismatch (e.g. a stale extension build against a newer page agent) surfaces a mild warning
// rather than failing silently.
export const PROTOCOL_VERSION = 1;

/** How a symbol is declared in its component; the detail pane groups by it. */
export type SymbolKind =
  'state' | 'derived' | 'prop' | 'store' | 'class' | 'context' | 'context-set';

export interface SerializedNode {
  id: number;
  name: string;
  parent: number | null;
  children: number[];
  snippets: string[];
  /** Clone-safe values (snippets → marker). */
  values: Record<string, unknown>;
  /** Symbols that can be edited from the panel. */
  writable: string[];
  /** Per-symbol category for grouping in the detail pane. */
  kinds?: Record<string, SymbolKind>;
  /** Optional source location "file:line" (names-only `__svelte_meta` fallback). */
  loc?: string;
}

/**
 * Stamped by the agent on everything it sends: which page this came from. One dev server is one
 * channel, so a panel can hear several pages and must be able to keep to the one it follows.
 * Distinct from the transport's own echo tag, which identifies a *transport instance* — one page
 * can hold two of those (the extension's and the panel window's).
 */
export interface FromSource {
  from?: string;
}

/**
 * The page a command is meant for, stamped by a panel that follows one of several. Without it a
 * shared channel delivers every command to every page: an edit from the panel window would change
 * the same component in every open tab. Absent means "whoever hears it", which is what the extension
 * relies on — there the background already routes by tab.
 */
export interface ToSource {
  to?: string;
}

export interface TreeMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'tree';
  nodes: SerializedNode[];
}

export interface EditMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'edit';
  id: number;
  symbol: string;
  /** Where in the symbol's value to write; empty replaces the whole value. */
  path: (string | number)[];
  value: unknown;
}

export interface RequestMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'request';
}

// Incremental tree updates: a delta of node changes since the last send, so a busy
// app sends only what changed instead of re-broadcasting the whole tree. add/update carry
// the full node (each node owns its children/parent, so a structural change shows up as an
// update on the affected nodes); remove carries just the id.
export type TreeOp =
  | { op: 'add'; node: SerializedNode }
  | { op: 'update'; node: SerializedNode }
  | { op: 'remove'; id: number };

export interface OpsMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'ops';
  ops: TreeOp[];
  /** The commit this delta is, so a consumer can build history from the stream it already gets. */
  commit?: number;
  /** When the commit happened (ms). */
  t?: number;
}

// Panel → page: "send me the commits I'm missing". A panel opened (or reconnected) after the fact
// has no history of its own; the agent keeps the ring, so it can answer.
export interface HistoryRequestMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'history-request';
  /** Only commits with a higher seq. 0 asks for everything the agent still holds. */
  since: number;
}

export interface HistoryMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'history';
  commits: Commit[];
  /** True when older commits were evicted — the history is bounded, and says so. */
  truncated: boolean;
}

// Panel → page actions that need page-side DOM / context (the panel runs in the DevTools
// context, so it asks the page to perform these). `picked` is the page's reply to `pick`.
export interface HighlightMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'highlight';
  id: number | null;
}
export interface PickMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'pick';
  active: boolean;
}
export interface PickedMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'picked';
  id: number | null;
}
export interface LogMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'log';
  id: number;
}
export interface StoreGlobalMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'storeGlobal';
  id: number;
  symbol: string;
}
// Lazy inspection. The panel asks for the children of a dehydrated value at `path` (a path
// into a node's values: [symbol, ...nested keys]); the page replies with a shallow subtree.
export interface InspectMessage extends ToSource {
  source: typeof SOURCE;
  kind: 'inspect';
  id: number;
  path: (string | number)[];
  /** How many entries of a partial value to send, when the panel wants more than it has. */
  limit?: number;
}
export interface HydrateMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'hydrate';
  id: number;
  path: (string | number)[];
  value: unknown;
}
// Version handshake: the panel sends its version on connect; the page replies with its own. The
// reply also names the tier that is feeding the panel — 0 = the app's own runespect plugin, 2 = a
// capture. Optional, so a page on an older agent still handshakes cleanly; the panel
// treats a tree with no reported tier as the extension's names-only DOM walk.
export interface HelloMessage extends FromSource {
  source: typeof SOURCE;
  kind: 'hello';
  version: number;
  tier?: 0 | 2;
  /** Why a capture recorded nothing, e.g. Svelte's internals did not have the expected shape. */
  problem?: string;
  /**
   * What page is speaking, for a panel that can hear several — two tabs, another route, islands
   * from separate bundles. *Who* it is comes from `from`, which every message carries; this is what
   * makes it recognisable to a human.
   */
  url?: string;
  title?: string;
  /** The app turned Open in editor off: its editor does not open the panel's links. */
  openInEditor?: false;
}

/** How a page describes itself in the handshake. Its id is `from`, on everything it sends. */
export interface SourceIdentity {
  url?: string;
  title?: string;
}

export type Message =
  | HistoryRequestMessage
  | HistoryMessage
  | TreeMessage
  | EditMessage
  | RequestMessage
  | OpsMessage
  | HighlightMessage
  | PickMessage
  | PickedMessage
  | LogMessage
  | StoreGlobalMessage
  | InspectMessage
  | HydrateMessage
  | HelloMessage;

// ── Message direction (an invariant the compiler enforces) ──
// The window transport echoes a sender's own messages back to its own listener, so a `kind` that
// is both SENT and HANDLED by the same side loops forever. Each kind
// belongs to exactly one direction; a side only HANDLES the opposite direction's kinds.
export const TO_PANEL_KINDS = ['tree', 'ops', 'picked', 'hydrate', 'hello', 'history'] as const; // agent → panel
export const TO_PAGE_KINDS = [
  'request',
  'edit',
  'highlight',
  'pick',
  'log',
  'storeGlobal',
  'inspect',
  'history-request',
] as const; // panel → agent

export type ToPanelMessage = Extract<Message, { kind: (typeof TO_PANEL_KINDS)[number] }>;
export type ToPageMessage = Extract<Message, { kind: (typeof TO_PAGE_KINDS)[number] }>;

// Narrow an incoming message to the direction a side may handle. The agent handles ToPage
// (panel→agent); the panel handles ToPanel (agent→panel). Switching on the wrong direction's kind
// after narrowing is a compile error — which is what blocks the self-echo loop class.
export function isToPage(m: Message): m is ToPageMessage {
  return (TO_PAGE_KINDS as readonly string[]).includes(m.kind);
}
export function isToPanel(m: Message): m is ToPanelMessage {
  return (TO_PANEL_KINDS as readonly string[]).includes(m.kind);
}

// Compile-time: every Message kind MUST be classified into exactly one direction. Add a new kind
// without listing it above and this line fails to type-check (UnclassifiedKind is no longer never).
type UnclassifiedKind = Exclude<
  Message['kind'],
  (typeof TO_PANEL_KINDS)[number] | (typeof TO_PAGE_KINDS)[number]
>;
const _allKindsClassified: [UnclassifiedKind] extends [never] ? true : never = true;
void _allKindsClassified;

// ── Control messages ──
// They travel the same channels as a Message but are not part of the conversation about the tree,
// so no side handles them alongside its direction's kinds: a hop's event log, posted to the page
// where the agent merges it (docs/reference/event-log.md), and a devtools panel naming its tab to
// the extension's service worker.
export interface EventsMessage {
  source: typeof SOURCE;
  kind: 'events';
  events: RunespectEvent[];
}
export interface RegisterMessage {
  source: typeof SOURCE;
  kind: 'register';
  tabId: number;
}
export type ControlMessage = EventsMessage | RegisterMessage;

export function eventsMessage(events: RunespectEvent[]): EventsMessage {
  return { source: SOURCE, kind: 'events', events };
}
export function registerMessage(tabId: number): RegisterMessage {
  return { source: SOURCE, kind: 'register', tabId };
}

// Names two contexts must agree on without sharing a module at runtime: both sides import them here.
/** The port a devtools panel opens to the background. */
export const PANEL_PORT = 'runespect-panel';
/** Set on the page's window once a runespect tree owns the page, so the names-only DOM walk stays quiet. */
export const TIER0_FLAG = '__runespect_tier0';
/** Hands events to the agent in the inspected page, from a context that can only evaluate code there. */
export function absorbExpression(events: RunespectEvent[]): string {
  return `window.__runespect && window.__runespect.absorb(${JSON.stringify(events)})`;
}

export function isControl(m: unknown): m is ControlMessage {
  if (!isRunespectMessage(m)) return false;
  const c = m as unknown as { kind: string; events?: unknown; tabId?: unknown };
  if (c.kind === 'events') return Array.isArray(c.events);
  if (c.kind === 'register') return typeof c.tabId === 'number';
  return false;
}

// Compile-time: a control message has a kind of its own, so it cannot reuse a conversation kind
// such as `hello`, the page's announcement.
type SharedKind = Extract<ControlMessage['kind'], Message['kind']>;
const _controlKindsOwn: [SharedKind] extends [never] ? true : never = true;
void _controlKindsOwn;

export interface Transport {
  send(message: Message): void;
  onMessage?(cb: (message: Message) => void): () => void;
}

// Page → panel: the full serialized tree, for a panel's first message; deltas follow as `ops`.
export function treeMessage(nodes: SerializedNode[]): TreeMessage {
  return { source: SOURCE, kind: 'tree', nodes };
}

// Panel → page: edit a writable value.
export function editMessage(
  id: number,
  symbol: string,
  value: unknown,
  path: (string | number)[] = [],
): EditMessage {
  return { source: SOURCE, kind: 'edit', id, symbol, path, value };
}

// Panel → page: ask for the current tree (a panel that connects after page load).
export function requestMessage(): RequestMessage {
  return { source: SOURCE, kind: 'request' };
}

export function opsMessage(ops: TreeOp[], commit: number, t: number): OpsMessage {
  return { source: SOURCE, kind: 'ops', ops, commit, t };
}

export function historyRequestMessage(since: number): HistoryRequestMessage {
  return { source: SOURCE, kind: 'history-request', since };
}

export function historyMessage(commits: Commit[], truncated: boolean): HistoryMessage {
  return { source: SOURCE, kind: 'history', commits, truncated };
}

export function highlightMessage(id: number | null): HighlightMessage {
  return { source: SOURCE, kind: 'highlight', id };
}
export function pickMessage(active: boolean): PickMessage {
  return { source: SOURCE, kind: 'pick', active };
}
export function pickedMessage(id: number | null): PickedMessage {
  return { source: SOURCE, kind: 'picked', id };
}
export function logMessage(id: number): LogMessage {
  return { source: SOURCE, kind: 'log', id };
}
export function storeGlobalMessage(id: number, symbol: string): StoreGlobalMessage {
  return { source: SOURCE, kind: 'storeGlobal', id, symbol };
}
export function inspectMessage(
  id: number,
  path: (string | number)[],
  limit?: number,
): InspectMessage {
  return { source: SOURCE, kind: 'inspect', id, path, ...(limit ? { limit } : {}) };
}
export function hydrateMessage(
  id: number,
  path: (string | number)[],
  value: unknown,
): HydrateMessage {
  return { source: SOURCE, kind: 'hydrate', id, path, value };
}
export function helloMessage(
  version: number,
  tier?: 0 | 2,
  identity?: SourceIdentity & Pick<HelloMessage, 'openInEditor'>,
): HelloMessage {
  return { source: SOURCE, kind: 'hello', version, ...(tier != null && { tier }), ...identity };
}

// The op that brings one node from what was sent before to what it is now, or null: an `add` when it
// was not sent, an `update` when its JSON differs. The one rule of what counts as a change.
export function opFor(before: SerializedNode | undefined, node: SerializedNode): TreeOp | null {
  if (!before) return { op: 'add', node };
  return JSON.stringify(before) === JSON.stringify(node) ? null : { op: 'update', node };
}

// Producer side: the delta between the previously-sent nodes (keyed by id) and the current
// ones. Removes first, then adds/updates.
export function diffOps(prev: Map<number, SerializedNode>, current: SerializedNode[]): TreeOp[] {
  const ops: TreeOp[] = [];
  const currentIds = new Set(current.map((n) => n.id));
  for (const id of prev.keys()) {
    if (!currentIds.has(id)) ops.push({ op: 'remove', id });
  }
  for (const node of current) {
    const op = opFor(prev.get(node.id), node);
    if (op) ops.push(op);
  }
  return ops;
}

// Consumer side: apply a delta to a node list (upsert for add/update, drop for remove).
export function applyOps(nodes: SerializedNode[], ops: TreeOp[]): SerializedNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const op of ops) {
    if (op.op === 'remove') byId.delete(op.id);
    else byId.set(op.node.id, op.node);
  }
  return [...byId.values()];
}

// Index a node list by id for diffing against the next send.
export function indexById<N extends { id: number }>(nodes: N[]): Map<number, N> {
  return new Map(nodes.map((n) => [n.id, n]));
}

// A tree's roots: the nodes without a parent, or whose parent is not in the list (an island, or a
// subtree a filter cut off).
export function isRoot(
  node: { parent: number | null },
  byId: { has(id: number): boolean },
): boolean {
  return node.parent == null || !byId.has(node.parent);
}

// What a JSON-like walk may descend into: a plain object, not a class instance, Map or Date.
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function isRunespectMessage(m: unknown): m is Message {
  return !!m && typeof m === 'object' && (m as { source?: unknown }).source === SOURCE;
}

// A function: a callback prop, a method, a snippet. Its name is what is left to show of it.
export interface FunctionMarker {
  __runespect: 'function';
  name: string;
}

// Values JSON cannot carry. The extension relay and the HMR channel are JSON, not structured clone,
// so dehydrate() encodes these for every channel, and the panel renders them as they are.
export type EncodedValue =
  | { __runespect: 'undefined' }
  | { __runespect: 'number'; value: 'NaN' | 'Infinity' | '-Infinity' }
  | { __runespect: 'bigint'; value: string }
  | { __runespect: 'date'; iso: string | null }
  | { __runespect: 'regexp'; source: string; flags: string }
  | { __runespect: 'error-object'; name: string; message: string }
  | { __runespect: 'map'; entries: [unknown, unknown][] }
  | { __runespect: 'set'; values: unknown[] }
  // Pairs rather than an object: a query string keeps its order and can repeat a key.
  | { __runespect: 'urlsearchparams'; entries: [unknown, unknown][] }
  // A string longer than the wire carries: its beginning, and how long it is.
  | { __runespect: 'string'; head: string; length: number }
  // A class instance as the agent expands it on request: its own fields and its get/set pairs.
  | { __runespect: 'instance'; name: string; fields: Record<string, unknown> };

// Every tag of EncodedValue, once: the compiler rejects a tag missing here or one too many.
export const ENCODED_TAGS: Record<EncodedValue['__runespect'], true> = {
  undefined: true,
  number: true,
  bigint: true,
  date: true,
  regexp: true,
  'error-object': true,
  map: true,
  set: true,
  urlsearchparams: true,
  string: true,
  instance: true,
};

/** The `__runespect` tag of a marker value, or undefined for any other value. */
export function markerTag(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const tag = (v as { __runespect?: unknown }).__runespect;
  return typeof tag === 'string' ? tag : undefined;
}

export function isEncodedValue(v: unknown): v is EncodedValue {
  const tag = markerTag(v);
  return tag !== undefined && Object.hasOwn(ENCODED_TAGS, tag);
}

export function isFunctionValue(v: unknown): v is FunctionMarker {
  return markerTag(v) === 'function';
}

// A value whose read threw (e.g. a derived that is only valid behind an {#if}). Shown as the error,
// never as a value.
export interface ErrorValue {
  __runespect: 'error';
  message: string;
}

export function errorValue(error: unknown): ErrorValue {
  return { __runespect: 'error', message: error instanceof Error ? error.message : String(error) };
}

export function isErrorValue(v: unknown): v is ErrorValue {
  return markerTag(v) === 'error';
}

// Lazy inspection: values are serialized only to a bounded depth. A container deeper than
// that is replaced by this marker, which carries enough to render a collapsed preview but no
// children; the panel fetches them on demand via `inspect`/`hydrate`.
export interface DehydratedValue {
  __runespect: 'dehydrated';
  /** valueType() of the stubbed value — 'object' | 'array' | 'map' | 'set' | 'typedarray' | 'arraybuffer'. */
  type: string;
  /** Collapsed one-line preview, e.g. "{ a, b, … } (5)" or "Array(3)". */
  preview: string;
  /** Entry count, so the panel knows it's expandable. */
  size: number;
  /** Binary data: the preview is all the panel gets, and it cannot be expanded. */
  opaque?: true;
}

// A container wider than the wire carries: its first entries, encoded as usual, and how many it has.
// The panel asks for more with an `inspect` that has a `limit`.
export interface PartialValue {
  __runespect: 'partial';
  value: unknown;
  size: number;
}

export function isPartialValue(v: unknown): v is PartialValue {
  return markerTag(v) === 'partial';
}

export function isDehydratedValue(v: unknown): v is DehydratedValue {
  return markerTag(v) === 'dehydrated';
}
