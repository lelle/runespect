import { test, expect } from 'vitest';
import {
  newestFirst,
  mergeCommits,
  forNode,
  changeLabel,
  changeKey,
  formatCommitTime,
} from '@runespect/ui/internal';
import type { Commit } from '@runespect/agent/protocol/internal';

const commit = (seq: number, ...ids: number[]): Commit => ({
  seq,
  t: seq * 10,
  changes: ids.map((id) => ({ op: 'update', id, name: `N${id}`, symbol: 'x', from: 1, to: 2 })),
});

// Takes what mergeCommits produces, which is ascending by seq — so this reverses rather than sorts.
test('the newest commit is shown first', () => {
  expect(newestFirst([commit(1), commit(2), commit(3)]).map((c) => c.seq)).toEqual([3, 2, 1]);
});

// The same commit arrives twice by design: once on the ops message that produced it, and again in
// the backlog the agent sends when the panel connects. It must appear once.
test('the backlog and the live stream merge without duplicating a commit', () => {
  const merged = mergeCommits([commit(2), commit(3)], [commit(1), commit(2)], 100);
  expect(merged.map((c) => c.seq)).toEqual([1, 2, 3]);
});

test('the panel keeps a bounded window too — the oldest go first', () => {
  const merged = mergeCommits([commit(1), commit(2)], [commit(3)], 2);
  expect(merged.map((c) => c.seq)).toEqual([2, 3]);
});

test('filtering to a component keeps only its changes, and drops commits left empty', () => {
  const filtered = forNode([commit(1, 7, 9), commit(2, 9)], 7);
  expect(filtered.map((c) => c.seq)).toEqual([1]);
  expect(filtered[0].changes).toHaveLength(1);
});

test('no selection means no filter', () => {
  expect(forNode([commit(1, 7)], null)).toHaveLength(1);
});

// One label rule for the button text, the summary line and the test selectors, so they cannot drift
// apart.
test('a change is labelled by component and value; a mount is labelled by component alone', () => {
  expect(changeLabel({ op: 'update', id: 1, name: 'Counter', symbol: 'count' })).toBe(
    'Counter.count',
  );
  expect(changeLabel({ op: 'add', id: 1, name: 'Toast' })).toBe('Toast');
});

test('the selector key distinguishes a mount from a change to a value', () => {
  expect(changeKey({ op: 'update', id: 1, name: 'Counter', symbol: 'count' })).toBe(
    'Counter.count',
  );
  expect(changeKey({ op: 'add', id: 1, name: 'Toast' })).toBe('Toast.add');
});

// A commit's time matches the console's timestamps, which are local. Pinned to a zone with an
// offset, because under UTC the two agree and the test could not fail.
test('formatCommitTime shows the local time of day', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Paris';
  try {
    const t = Date.UTC(2026, 9, 22, 13, 58, 3); // 15:58:03 in Paris (CEST, UTC+2)
    expect(formatCommitTime(t)).toBe('15:58:03');
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
});
