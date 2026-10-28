import {
  absorbExpression,
  errorValue,
  isControl,
  type ControlMessage,
  type Message,
  type Transport,
} from '@runespect/agent/protocol/internal';
import { createMirror } from './mirror.js';
import { reconnectingPort, type ReconnectingPortOptions } from './panel-port.js';

export interface PanelHopOptions extends ReconnectingPortOptions {
  /** Runs an expression in the inspected page (chrome.devtools.inspectedWindow.eval). */
  evalInPage: (expression: string) => void;
  /** When a burst is mirrored (requestAnimationFrame: after the panel has rendered). */
  schedule: (flush: () => void) => void;
}

// The devtools panel's half of the chain: its port to the background, and its event log.
//
// The panel runs in the DevTools context, which page-driving tools and coding agents cannot reach.
// It therefore mirrors its own events, the port's (connect, reconnect, disconnect: where a silent
// panel usually starts) and the background's into the INSPECTED page, where the agent merges them
// into window.__runespect. Always on: the point of a log is the failure that already happened.
// Envelopes only, see docs/reference/event-log.md.
export function startPanel({ evalInPage, schedule, ...port }: PanelHopOptions): {
  transport: Transport & { close: () => void };
  onError: (pane: string, error: unknown) => void;
} {
  const transport = reconnectingPort(port);
  // The whole log each time: the inspected page can reload while the panel stays open. After an
  // extension reload the eval throws "Extension context invalidated", and the mirror stops; the user
  // gets a fresh panel by reopening DevTools.
  const mirror = createMirror({
    send: (all) => evalInPage(absorbExpression(all)),
    deliver: 'whole',
    schedule,
  });
  const events = mirror.log('panel');
  mirror.include(transport.events);
  // The port carries the background's control messages as well as the page's.
  transport.onMessage?.((m: Message | ControlMessage) => {
    if (isControl(m) && m.kind === 'events') return mirror.carry(m.events);
    events.record('rx', { kind: m.kind });
  });
  events.record('connect');
  return {
    transport,
    onError: (pane, error) =>
      void events.record('error', { pane, error: errorValue(error).message }),
  };
}
