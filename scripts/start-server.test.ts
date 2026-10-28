import { test, expect } from 'vitest';
import { startServer, waitForUrl } from '../e2e/lib.ts';

// `pnpm` runs the server as a child of its own, and stopping pnpm alone leaves that child on the
// port: the next run then talks to a stale server.
const PORT = 5179;
const URL = `http://localhost:${PORT}/`;
const listen = `require('node:http').createServer((_, res) => res.end('ok')).listen(${PORT})`;

const isUp = () =>
  fetch(URL).then(
    () => true,
    () => false,
  );

test('stopping a server stops what pnpm started, so its port is free again', async () => {
  const server = startServer(['exec', 'node', '-e', listen]);
  await waitForUrl(URL);

  await server.stop();

  expect(await isUp()).toBe(false);
}, 30_000);
