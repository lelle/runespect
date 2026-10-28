import { compileMatcher, type Commit, type RunespectEvent } from './protocol/internal';
import { allInOrder, find, onServer, setValue, type InspectNode } from './tree.svelte';
import { commitsSince } from './history';
import { activate, inspectPath, serializeNode, WIRE_DEPTH } from './wire.svelte';
import { absorbForeign, eventsSince, timeline } from './observe';

// window.__runespect is the one surface a developer, an e2e test and a coding agent can all read,
// so the agent (the only hop living in the page's main world) publishes it and the other hops
// mirror their own buffers in via absorb(). The event log holds envelopes only, never the app's
// values (docs/reference/event-log.md); the tree, values, history and set() read and write the app
// the way the panel does, and exist only where the agent runs: in dev.
/** A component as tree() and find() list it. */
export interface ComponentSummary {
  id: number;
  name: string;
  parent: number | null;
  children: number[];
  /** The source file, when the plugin instrumented it. */
  loc?: string;
}

export interface RunespectSurface {
  /** Every component, in the order they mounted. */
  tree(): ComponentSummary[];
  /** Components whose name contains `query` (any case), or matches it as `/regex/flags`. */
  find(query: string): ComponentSummary[];
  /**
   * One component's values grouped by kind (`state`, `derived`, `prop`, `store`, …), as the panel
   * receives them: one level deep, with deeper containers as markers. Null for an unknown id.
   */
  values(id: number): Record<string, Record<string, unknown>> | null;
  /** The value at `[symbol, ...keys]`, one level deep; `limit` entries of a wide one. */
  inspect(id: number, path: (string | number)[], limit?: number): unknown;
  /** The commits the agent holds after `since` (a commit's `seq`), oldest first. */
  history(since?: number): Commit[];
  /** Set a writable value, or a field inside one at `path`, as an edit from the panel does. */
  set(id: number, symbol: string, value: unknown, path?: (string | number)[]): boolean;
  /** Every hop's events, newest last, in one timeline. */
  readonly events: RunespectEvent[];
  /** The agent's own events recorded after `seq`. */
  since(seq: number): RunespectEvent[];
  /** The whole timeline as JSON, for pasting into a bug report. */
  dump(): string;
  /** Mirror another hop's buffer in (used by the extension panel). */
  absorb(incoming: RunespectEvent[]): void;
}

export function publishSurface(): void {
  if (onServer()) return;
  const summary = (n: InspectNode): ComponentSummary => ({
    id: n.id,
    name: n.name,
    parent: n.parent,
    children: n.children.slice(),
    ...(n.loc ? { loc: n.loc } : {}),
  });
  const surface: RunespectSurface = {
    tree: () => allInOrder().map(summary),
    find: (query) => {
      const m = compileMatcher(query);
      return m
        ? allInOrder()
            .filter((n) => m.test(n.name))
            .map(summary)
        : [];
    },
    values: (id) => {
      activate();
      const n = find(id);
      if (!n) return null;
      const { values, kinds } = serializeNode(n, WIRE_DEPTH);
      const grouped: Record<string, Record<string, unknown>> = {};
      for (const [symbol, value] of Object.entries(values)) {
        (grouped[kinds?.[symbol] ?? 'value'] ??= {})[symbol] = value;
      }
      return grouped;
    },
    inspect: (id, path, limit) => {
      activate();
      return inspectPath(id, path, limit);
    },
    history: (since = 0) => {
      activate();
      return commitsSince(since);
    },
    set: (id, symbol, value, path) => {
      activate();
      return setValue(id, symbol, value, path);
    },
    get events() {
      return timeline();
    },
    since: (seq) => eventsSince(seq),
    dump: () => JSON.stringify({ events: timeline() }),
    absorb: absorbForeign,
  };
  (globalThis as unknown as { __runespect: RunespectSurface }).__runespect = surface;
}
