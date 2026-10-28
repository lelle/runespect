import {
  createEventLog,
  EVENT_LIMIT,
  mergeEvents,
  type EventKind,
  type Message,
  type RunespectEvent,
} from './protocol/internal';

// The agent's own event log, and the logs of the other hops (relay, background, panel) mirrored in,
// as one timeline. Envelopes only, never the app's values (docs/reference/event-log.md).
const freshObserved = () => ({
  events: createEventLog('agent'),
  // Other hops' events, mirrored in by absorb().
  foreign: [] as RunespectEvent[],
  foreignKeys: new Set<string>(),
});
let observed = freshObserved();

// Cheap shape metrics for a tx event: how big the payload was and how much tree it carried.
export function sizeOf(message: Message): { nodes?: number; ops?: number } {
  if (message.kind === 'tree') return { nodes: message.nodes.length };
  if (message.kind === 'ops') return { ops: message.ops.length };
  return {};
}

// Keyed by hop, seq and time: a hop that re-mirrors its whole buffer adds nothing twice, and a hop
// that restarted (its seq back at 0) is still heard. Each hop keeps its own last EVENT_LIMIT.
const eventKey = (e: RunespectEvent): string => `${e.hop}:${e.seq}:${e.t}`;
export function absorbForeign(incoming: RunespectEvent[]): void {
  let added = false;
  for (const e of incoming) {
    const key = eventKey(e);
    if (observed.foreignKeys.has(key)) continue;
    observed.foreignKeys.add(key);
    observed.foreign.push(e);
    added = true;
  }
  if (!added) return;
  const perHop = new Map<string, number>();
  for (let i = observed.foreign.length - 1; i >= 0; i--) {
    const count = (perHop.get(observed.foreign[i].hop) ?? 0) + 1;
    perHop.set(observed.foreign[i].hop, count);
    if (count > EVENT_LIMIT)
      observed.foreignKeys.delete(eventKey(observed.foreign.splice(i, 1)[0]));
  }
}

export function record(ev: EventKind, extra?: Record<string, unknown>): void {
  observed.events.record(ev, extra);
}

/** Every hop's events, newest last. */
export function timeline(): RunespectEvent[] {
  return mergeEvents(observed.events.events, observed.foreign);
}

/** The agent's own events recorded after `seq`. */
export function eventsSince(seq: number): RunespectEvent[] {
  return observed.events.since(seq);
}

export function resetObserve(): void {
  observed = freshObserved();
}
