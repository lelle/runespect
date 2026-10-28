import {
  createEventLog,
  type EventLog,
  type Hop,
  type RunespectEvent,
} from '@runespect/agent/protocol/internal';

// How a hop's event log reaches the page, where the agent merges every hop into window.__runespect
// (docs/reference/event-log.md). Each hop records; the mirror decides when and what to send.

export interface MirrorOptions {
  /** Hands a batch to the receiver. A throw means the receiver is gone for good; the mirror stops. */
  send: (events: RunespectEvent[]) => void;
  /**
   * 'fresh': only what the receiver has not had, for a receiver that lives exactly as long as this
   * hop (the relay's own page). 'whole': every buffer each time, for a receiver that can be replaced
   * under it (a reloaded page, a reconnected port). The agent drops what it already has, so a resend
   * adds nothing twice.
   */
  deliver: 'fresh' | 'whole';
  /** When a burst is flushed; one send per burst. */
  schedule?: (flush: () => void) => void;
}

export interface Mirror {
  /** A log for this hop. Recording to it schedules a flush, so no call site can forget to publish. */
  log(hop: Hop): EventLog;
  /** A log kept elsewhere (the panel port's, or one several mirrors share). Whoever records there pokes. */
  include(events: () => readonly RunespectEvent[]): void;
  /** Another hop's log, as it last arrived. Replaces the one carried before. */
  carry(events: RunespectEvent[]): void;
  /** Schedule a flush, for a change the mirror cannot see. */
  poke(): void;
  readonly dead: boolean;
}

export function createMirror({ send, deliver, schedule = queueMicrotask }: MirrorOptions): Mirror {
  const sources: { read: () => readonly RunespectEvent[]; sent: number }[] = [];
  let carried: RunespectEvent[] = [];
  let carriedSent = true;
  let scheduled = false;
  let dead = false;

  const flush = (): void => {
    scheduled = false;
    if (dead) return;
    const batch: RunespectEvent[] = [];
    for (const source of sources) {
      const events = source.read();
      batch.push(...(deliver === 'whole' ? events : events.filter((e) => e.seq > source.sent)));
      if (events.length) source.sent = events[events.length - 1].seq;
    }
    if (deliver === 'whole' || !carriedSent) batch.push(...carried);
    carriedSent = true;
    if (!batch.length) return;
    try {
      send(batch);
    } catch {
      dead = true;
    }
  };
  const poke = (): void => {
    if (scheduled || dead) return;
    scheduled = true;
    schedule(flush);
  };

  return {
    log(hop) {
      const log = createEventLog(hop);
      sources.push({ read: () => log.events, sent: -1 });
      return {
        ...log,
        record(ev, extra) {
          const event = log.record(ev, extra);
          poke();
          return event;
        },
      };
    },
    include(events) {
      sources.push({ read: events, sent: -1 });
    },
    carry(events) {
      carried = events;
      carriedSent = false;
      poke();
    },
    poke,
    get dead() {
      return dead;
    },
  };
}
