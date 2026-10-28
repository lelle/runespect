import { test, expect, vi } from 'vitest';
import * as agent from '@runespect/agent/internal';
import { component, start } from '@runespect/agent/runtime';

// The injected code calls the runtime while the app's component starts. Whatever goes wrong in
// runespect stays in runespect: the component starts anyway, and runespect says so once.
test('a runtime call that fails warns once and does not throw into the app', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    // Outside a component, Svelte refuses getContext: the runtime's own failure.
    expect(() => component({ name: 'Lost', symbols: {} })).not.toThrow();
    expect(() => component({ name: 'Lost', symbols: {} })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[runespect]');
  } finally {
    warn.mockRestore();
  }
});

// What the dev server's injected module does on every page: report to the window (the extension)
// and over the hot channel (the panel window). Open in editor, when turned off, is already off in
// the first hello either of them hears.
function started(options: { openInEditor?: boolean } = {}) {
  agent.reset();
  const hot = {
    sent: [] as Record<string, unknown>[],
    send(_event: string, data: unknown) {
      this.sent.push(data as Record<string, unknown>);
    },
    on() {},
  };
  const posted: Record<string, unknown>[] = [];
  const listen = (e: MessageEvent) => posted.push(e.data);
  window.addEventListener('message', listen);
  const stop = start({ hot, ...options });
  return {
    hot,
    posted,
    stop: () => {
      stop();
      window.removeEventListener('message', listen);
    },
  };
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a started page says hello over the hot channel and to the window', async () => {
  const page = started();
  await settled();
  page.stop();

  expect(page.hot.sent.find((m) => m.kind === 'hello')).toBeTruthy();
  expect(page.posted.find((m) => m.kind === 'hello')).toBeTruthy();
});

test('a page started with Open in editor off says so in its first hello', async () => {
  const page = started({ openInEditor: false });
  await settled();
  page.stop();
  agent.reset();

  expect(page.hot.sent.find((m) => m.kind === 'hello')).toMatchObject({ openInEditor: false });
});
