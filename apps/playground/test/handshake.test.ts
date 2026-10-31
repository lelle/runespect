import { test, expect, beforeEach, afterEach } from 'vitest';
import * as agent from '@runespect/agent/internal';
import { PROTOCOL_VERSION, helloMessage } from '@runespect/agent/protocol/internal';
import { mountPanel } from './helpers/panel';

let disconnect: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
});

const panelWith = () => mountPanel();

// The mismatch warning lives in the shared status bar — one place owns "the connection is off",
// so a mismatch and a tier warning can never contradict each other. See panel-tier-bar.test.ts.
const warning = (t: HTMLElement) => {
  const el = t.querySelector('[data-testid="runespect-status"]') as HTMLElement | null;
  return el?.dataset.level === 'warn' ? el : null;
};

test('Panel asks for the tree (request) on connect; the page volunteers its hello', () => {
  const { sent } = panelWith();
  expect(sent.some((m) => m.kind === 'request')).toBe(true);
  // the panel must NOT proactively send hello (only the page announces its version) — see the
  // no-echo-loop guarantee below
  expect(sent.some((m) => m.kind === 'hello')).toBe(false);
});

test('Panel warns when the page reports a different protocol version', () => {
  const { emit, target } = panelWith();
  emit(helloMessage(PROTOCOL_VERSION + 1));
  expect(warning(target)).toBeTruthy();
  expect(warning(target)!.textContent).toContain(String(PROTOCOL_VERSION + 1));
});

test('Panel does not warn when versions match', () => {
  const { emit, target } = panelWith();
  emit(helloMessage(PROTOCOL_VERSION));
  expect(warning(target)).toBeNull();
});

test('agent announces its version and tier (hello) in response to a request', () => {
  const sent: any[] = [];
  let listener: ((m: any) => void) | null = null;
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => ((listener = cb), () => (listener = null)),
  };
  disconnect = agent.connect(transport);
  listener!({ source: 'runespect', kind: 'request' });
  // tier 0 = the app's own instrumentation, which is what makes edits/highlight possible; `from`
  // and the identity fields say WHICH page said it, so a panel hearing several can keep them apart.
  expect(sent).toContainEqual(
    expect.objectContaining({
      source: 'runespect',
      kind: 'hello',
      version: PROTOCOL_VERSION,
      tier: 0,
      from: expect.any(String), // which page said it — the id every message carries
    }),
  );
});

test('agent does NOT reply to a hello — guards the window-transport echo loop', () => {
  const sent: any[] = [];
  let listener: ((m: any) => void) | null = null;
  const transport = {
    send: (m: any) => sent.push(m),
    onMessage: (cb: any) => ((listener = cb), () => (listener = null)),
  };
  disconnect = agent.connect(transport);
  sent.length = 0; // ignore the initial snapshot
  listener!(helloMessage(PROTOCOL_VERSION)); // the agent's own echoed reply would look like this
  expect(sent.some((m) => m.kind === 'hello')).toBe(false); // no reply → no runaway loop
});

// Reloading the page with DevTools already open puts the panel's one-shot `request` before the new
// page's agent exists: trees then flow (the broadcast posts them) but the handshake never happens,
// so the panel reports Names only on a perfectly good plugin page. The agent therefore announces itself
// when it connects, instead of only when asked.
test('agent announces its hello on connect, without waiting to be asked', () => {
  const sent: any[] = [];
  disconnect = agent.connect({ send: (m: any) => sent.push(m), onMessage: () => () => {} });

  expect(sent).toContainEqual(
    expect.objectContaining({ kind: 'hello', version: PROTOCOL_VERSION, tier: 0 }),
  );
});

// A team whose editor does not open vscode:// links turns Open in editor off with
// runespect({ openInEditor: false }); the hello is what tells every panel, wherever it runs.
test('agent says in its hello when Open in editor is off, and says nothing by default', () => {
  const hellos = () => {
    const sent: any[] = [];
    const stop = agent.connect({ send: (m: any) => sent.push(m), onMessage: () => () => {} });
    stop();
    return sent.filter((m) => m.kind === 'hello');
  };
  expect(hellos()[0]).not.toHaveProperty('openInEditor');

  agent.setOpenInEditor(false);
  expect(hellos()[0]).toMatchObject({ openInEditor: false });

  agent.reset();
  expect(hellos()[0]).not.toHaveProperty('openInEditor');
});
