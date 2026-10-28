// The Chrome extension APIs the hops use, in memory, joined as Chrome joins them: a panel's
// connect() reaches the worker's onConnect, the worker's tabs.sendMessage reaches that tab's content
// script, and the content script's sendMessage reaches the worker with its tab as the sender.
// Messages are JSON-copied and arrive in a later microtask, as Chrome delivers them. One test can
// then run the whole chain: page agent, relay, background, panel port, panel.

type Listener<A extends unknown[]> = (...args: A) => void;

function listeners<A extends unknown[]>() {
  const all = new Set<Listener<A>>();
  return {
    addListener: (cb: Listener<A>) => void all.add(cb),
    removeListener: (cb: Listener<A>) => void all.delete(cb),
    emit: (...args: A) => all.forEach((cb) => cb(...args)),
  };
}

const copy = (m: unknown): unknown => JSON.parse(JSON.stringify(m));
const later = (run: () => void): void => queueMicrotask(run);
const INVALIDATED = 'Extension context invalidated.';

export interface FakePort {
  name: string;
  postMessage(m: unknown): void;
  disconnect(): void;
  onMessage: { addListener(cb: (m: any) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
}

// Two ends of one port. Posting on one end delivers on the other; disconnecting one end tells the
// other, as Chrome does (the end that disconnects hears nothing).
function portPair(name: string): [FakePort, FakePort] {
  const ends = [0, 1].map(() => ({
    onMessage: listeners<[unknown]>(),
    onDisconnect: listeners<[]>(),
  }));
  let open = true;
  const end = (self: number): FakePort => ({
    name,
    postMessage(m) {
      if (!open) throw new Error('Attempting to use a disconnected port object');
      const message = copy(m);
      later(() => open && ends[1 - self].onMessage.emit(message));
    },
    disconnect() {
      if (!open) return;
      open = false;
      later(() => ends[1 - self].onDisconnect.emit());
    },
    onMessage: ends[self].onMessage,
    onDisconnect: ends[self].onDisconnect,
  });
  return [end(0), end(1)];
}

const workerSide = () => ({
  onConnect: listeners<[FakePort]>(),
  onMessage: listeners<[unknown, { tab?: { id?: number } }]>(),
});

export function fakeChrome() {
  let alive = true;
  let worker = workerSide();
  let workerPorts: FakePort[] = [];
  const contentScripts = new Map<number, ReturnType<typeof listeners<[unknown]>>>();
  const unreachable = new Set<number>();

  return {
    /** chrome.runtime as the service worker sees it. */
    workerRuntime: {
      onConnect: {
        addListener: (cb: (port: FakePort) => void) => worker.onConnect.addListener(cb),
      },
      onMessage: {
        addListener: (cb: (m: unknown, sender: { tab?: { id?: number } }) => void) =>
          worker.onMessage.addListener(cb),
      },
    },
    /** chrome.tabs as the service worker sees it. */
    tabs: {
      async sendMessage(tabId: number, m: unknown): Promise<unknown> {
        const script = contentScripts.get(tabId);
        if (!script || unreachable.has(tabId))
          throw new Error('Could not establish connection. Receiving end does not exist.');
        const message = copy(m);
        later(() => script.emit(message));
        return undefined;
      },
    },
    /** chrome.runtime as a tab's content script sees it. */
    contentRuntime(tabId: number) {
      const onMessage = contentScripts.get(tabId) ?? listeners<[unknown]>();
      contentScripts.set(tabId, onMessage);
      return {
        get id() {
          return alive ? 'runespect' : undefined;
        },
        sendMessage(m: unknown): void {
          if (!alive) throw new Error(INVALIDATED);
          const message = copy(m);
          later(() => worker.onMessage.emit(message, { tab: { id: tabId } }));
        },
        onMessage,
      };
    },
    /** chrome.runtime.connect as a devtools panel calls it. */
    connect(name: string): FakePort {
      if (!alive) throw new Error(INVALIDATED);
      const [panelEnd, workerEnd] = portPair(name);
      workerPorts.push(workerEnd);
      const listening = worker;
      later(() => listening.onConnect.emit(workerEnd));
      return panelEnd;
    },
    /** chrome.devtools.inspectedWindow.eval, run in `win` as the inspected page would run it. */
    evalIn(win: Window) {
      const evaluate = (expression: string): void => {
        evaluate.calls++;
        if (!alive) throw new Error(INVALIDATED);
        new Function('window', expression)(win);
      };
      evaluate.calls = 0;
      return evaluate;
    },
    /** A tab whose content script is gone: a send to it is refused. */
    unreachable: (tabId: number) => void unreachable.add(tabId),
    /** MV3 retired the worker: its ports drop and its listeners are gone. Start routing again after. */
    restartWorker(): void {
      workerPorts.forEach((p) => p.disconnect());
      workerPorts = [];
      worker = workerSide();
    },
    /** The extension was reloaded: every chrome call from the old contexts throws. */
    invalidate: () => void (alive = false),
    /** Lets every queued delivery, and the ones they cause, arrive. */
    async settle(rounds = 20): Promise<void> {
      for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
    },
  };
}
