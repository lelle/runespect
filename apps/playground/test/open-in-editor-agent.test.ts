import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as agent from '@runespect/agent/internal';
import type { Message } from '@runespect/agent/protocol/internal';

// Open in editor goes through the page: a panel asks it, and the agent calls its own dev server's
// /__open-in-editor, whose launch-editor opens the editor LAUNCH_EDITOR or EDITOR names. The
// extension cannot reach the dev server itself, and the panel window need not know where it is.

let stop: (() => void) | undefined;
beforeEach(() => agent.reset());
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

function connected() {
  const sent: Message[] = [];
  let deliver: (m: Message) => void = () => {};
  stop = agent.connect({
    send: (m) => sent.push(m),
    onMessage: (cb) => {
      deliver = cb;
      return () => {};
    },
  });
  const ask = (loc: string, to?: string) =>
    deliver({ source: 'runespect', kind: 'open-in-editor', loc, ...(to ? { to } : {}) });
  return { sent, ask, opened: () => sent.filter((m) => m.kind === 'opened') };
}

const settled = () => new Promise((r) => setTimeout(r, 0));

test("asked to open a file, the page calls its dev server's /__open-in-editor, and says it did", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const page = connected();

  page.ask('/app/src/Cart List.svelte:12');
  await settled();

  expect(fetch).toHaveBeenCalledWith(
    '/__open-in-editor?file=%2Fapp%2Fsrc%2FCart%20List.svelte%3A12',
  );
  expect(page.opened()).toEqual([
    expect.objectContaining({ loc: '/app/src/Cart List.svelte:12', ok: true }),
  ]);
});

test('a dev server that cannot be reached, or answers with an error, is said so', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  const page = connected();
  page.ask('/a.svelte:1');
  await settled();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
  );
  page.ask('/b.svelte:2');
  await settled();

  expect(page.opened().map((m) => (m as { ok: boolean }).ok)).toEqual([false, false]);
});

test('with Open in editor off, or as vscode:// links, the page calls no dev server', async () => {
  const fetch = vi.fn(async () => new Response(null));
  vi.stubGlobal('fetch', fetch);
  agent.setOpenInEditor(false);
  connected().ask('/a.svelte:1');
  stop?.();
  agent.setOpenInEditor('vscode');
  connected().ask('/a.svelte:1');
  await settled();

  expect(fetch).not.toHaveBeenCalled();
});

test('the hello says how Open in editor opens: nothing by default, vscode or off', () => {
  const hello = () => connected().sent.find((m) => m.kind === 'hello');

  expect(hello()).not.toHaveProperty('openInEditor');
  stop?.();
  agent.setOpenInEditor('vscode');
  expect(hello()).toMatchObject({ openInEditor: 'vscode' });
  stop?.();
  agent.setOpenInEditor(false);
  expect(hello()).toMatchObject({ openInEditor: false });
});
