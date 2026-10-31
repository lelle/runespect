// @vitest-environment node
import { test, expect, vi } from 'vitest';
import { createHotTransport, pageChannel } from '@runespect/agent/internal';
import { treeMessage } from '@runespect/agent/protocol/internal';

// The channel between a page and a panel window of a build: two documents of one origin, and no dev
// server between them.

const received = (cb: ReturnType<typeof vi.fn>) => vi.waitFor(() => expect(cb).toHaveBeenCalled());

test('what one end sends reaches the other, as the hot channel would carry it', async () => {
  const page = createHotTransport(pageChannel());
  const panel = createHotTransport(pageChannel());
  const heard = vi.fn();
  const stop = panel.onMessage!(heard);

  page.send(treeMessage([]));

  await received(heard);
  expect(heard.mock.calls[0][0]).toMatchObject({ kind: 'tree' });
  stop();
});

test('a stopped listener hears nothing more', async () => {
  const page = createHotTransport(pageChannel());
  const panel = createHotTransport(pageChannel());
  const late = createHotTransport(pageChannel());
  const stopped = vi.fn();
  const live = vi.fn();
  panel.onMessage!(stopped)();
  const stop = late.onMessage!(live);

  page.send(treeMessage([]));

  await received(live);
  expect(stopped).not.toHaveBeenCalled();
  stop();
});
