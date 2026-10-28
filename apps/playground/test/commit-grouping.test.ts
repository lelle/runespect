import { test, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import * as agent from '@runespect/agent/internal';
import { openPanel } from './helpers/agent';

// What one history entry is: a commit is one reactive flush, the effect re-run that Svelte batches
// after a group of synchronous writes. The agent diffs from a single $effect, so each run of it is
// one commit, and the history tab shows exactly that.

beforeEach(() => agent.reset());

const collect = () => {
  const sent: any[] = [];
  const stop = agent.connect(
    openPanel({ send: (m: any) => sent.push(m), onMessage: () => () => {} }),
  );
  flushSync(); // initial tree snapshot
  return { sent, stop };
};

test('a batch of synchronous writes is one commit, sent as one ops message', () => {
  const id = agent.enter('C');
  agent.report(id, 'a', 1);
  const { sent, stop } = collect();

  // three synchronous writes in one tick = one batch
  agent.report(id, 'a', 2);
  agent.report(id, 'b', 3);
  agent.report(id, 'c', 4);
  flushSync();

  const opsMsgs = sent.filter((m) => m.kind === 'ops');
  expect(opsMsgs.length).toBe(1); // batched into a single commit, not three
  // the one commit carries the change: a single update op for the node with all three new values
  const op = opsMsgs[0].ops.find((o: any) => o.op === 'update' && o.node.id === id);
  expect(op).toBeTruthy();
  expect(op.node.values).toMatchObject({ a: 2, b: 3, c: 4 });
  stop();
});

test('writes in separate ticks are separate commits, one ops message each', async () => {
  const id = agent.enter('C');
  agent.report(id, 'a', 1);
  const { sent, stop } = collect();

  agent.report(id, 'a', 2);
  flushSync();
  await Promise.resolve(); // new microtask → new tick
  agent.report(id, 'a', 3);
  flushSync();

  const opsMsgs = sent.filter((m) => m.kind === 'ops');
  expect(opsMsgs.length).toBe(2); // two distinct commits
  stop();
});

test('a commit names which nodes and symbols changed', () => {
  const a = agent.enter('A');
  agent.report(a, 'x', 1);
  const b = agent.enter('B');
  agent.report(b, 'y', 1);
  const { sent, stop } = collect();

  // change only B in this commit
  agent.report(b, 'y', 2);
  flushSync();

  const ops = sent.filter((m) => m.kind === 'ops').at(-1)!.ops;
  const touched = ops.filter((o: any) => o.op === 'update').map((o: any) => o.node.id);
  expect(touched).toContain(b);
  expect(touched).not.toContain(a); // A is untouched → not in the commit
  stop();
});
