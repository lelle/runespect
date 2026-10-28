import { mount, flushSync } from 'svelte';
import { Panel } from '@runespect/ui/internal';
import type { Message, SerializedNode } from '@runespect/agent/protocol/internal';

/**
 * A <Panel> mounted in the document with an in-memory transport: `sent` holds what it asked the page,
 * `emit` plays a message from the page, and `click` presses an element; each flushes afterwards.
 */
export function mountPanel(props: Record<string, unknown> = {}) {
  let listener: ((m: Message) => void) | undefined;
  const sent: Message[] = [];
  const target = document.body.appendChild(document.createElement('div'));
  mount(Panel, {
    target,
    props: {
      ...props,
      transport: {
        send: (m: Message) => sent.push(m),
        onMessage: (cb: (m: Message) => void) => {
          listener = cb;
          return () => (listener = undefined);
        },
      },
    },
  });
  flushSync();
  return {
    target,
    sent,
    emit(m: Message): void {
      listener?.(m);
      flushSync();
    },
    click(selector: string): void {
      (target.querySelector(selector) as HTMLElement).click();
      flushSync();
    },
  };
}

/** A component as the wire carries it; values and writable symbols as given. */
export const node = (
  id: number,
  name: string,
  values: Record<string, unknown> = {},
  extra: Partial<SerializedNode> = {},
): SerializedNode => ({
  id,
  name,
  parent: null,
  children: [],
  snippets: [],
  values,
  writable: [],
  ...extra,
});
