// Runtime transparency for the message chain (page agent → relay → background → panel port →
// panel). Every hop keeps a small ring buffer of what crossed it and what happened to its
// connection; the panel mirrors them all into the inspected page as window.__runespect, which is
// the one context a developer, an e2e test and a coding agent can all reach.
//
// Envelopes only — kind, size, counts, lifecycle — never the app's values. The log is always on,
// so the question "what happened just before it broke?" is answerable without reproducing first.

export type Hop = 'agent' | 'relay' | 'background' | 'panel-port' | 'panel';

export type EventKind =
  /** A message left this hop. */
  | 'tx'
  /** A message arrived at this hop. */
  | 'rx'
  | 'connect'
  | 'reconnect'
  | 'disconnect'
  /** A message was refused or discarded here — the reason belongs in `error`. */
  | 'drop'
  /** The active tier changed (0 = app plugin, 2 = capture, null = none reported). */
  | 'tier'
  /** A pane of the panel failed to render — which one in `pane`, the message in `error`. */
  | 'error';

export interface RunespectEvent {
  /** Wall-clock ms, so events from different hops merge into one timeline. */
  t: number;
  /** Per-hop counter. A gap means events were dropped from the window, not that they never happened. */
  seq: number;
  hop: Hop;
  ev: EventKind;
  /** The protocol message kind, for tx/rx. */
  kind?: string;
  nodes?: number;
  bytes?: number;
  error?: string;
  [extra: string]: unknown;
}

/** Ring-buffer size per hop: enough to cover a page load and the seconds around a failure. */
export const EVENT_LIMIT = 200;

export interface EventLog {
  readonly hop: Hop;
  readonly events: RunespectEvent[];
  record(ev: EventKind, extra?: Record<string, unknown>): RunespectEvent;
  /** Events recorded after `seq` — how a test or an agent polls without re-reading everything. */
  since(seq: number): RunespectEvent[];
  /** The whole buffer as JSON, for pasting into a bug report. */
  dump(): string;
}

export function createEventLog(hop: Hop, limit: number = EVENT_LIMIT): EventLog {
  const events: RunespectEvent[] = [];
  let seq = 0;
  return {
    hop,
    events,
    record(ev, extra) {
      const event: RunespectEvent = { t: Date.now(), seq: seq++, hop, ev, ...extra };
      events.push(event);
      if (events.length > limit) events.splice(0, events.length - limit);
      return event;
    },
    since(after) {
      return events.filter((e) => e.seq > after);
    },
    dump() {
      return JSON.stringify({ hop, events });
    },
  };
}

// One timeline from several hops. Ordered by time, with the hop's own seq breaking ties so a
// burst recorded within the same millisecond keeps its real order.
export function mergeEvents(...logs: RunespectEvent[][]): RunespectEvent[] {
  return logs.flat().sort((a, b) => a.t - b.t || a.seq - b.seq);
}
