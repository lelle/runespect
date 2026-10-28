import { requestMessage, type Message, type Transport } from '@runespect/agent/protocol/internal';

/**
 * A transport with an open panel at the other end: it learns the page from its hello and asks that
 * page for its tree, as a panel does once it has picked a page.
 */
export function openPanel(transport: Transport): Transport {
  let deliver: ((message: Message) => void) | undefined;
  let asked = false;
  return {
    send: (message) => {
      transport.send(message);
      if (asked || message.kind !== 'hello' || !deliver) return;
      asked = true;
      deliver({ ...requestMessage(), to: message.from });
    },
    onMessage: (cb) => {
      deliver = cb;
      const off = transport.onMessage?.(cb);
      return () => off?.();
    },
  };
}
