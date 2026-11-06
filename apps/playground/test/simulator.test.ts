import { test, expect } from 'vitest';
import { simulate } from './helpers/sim';

// Pages and a panel on one bus, without a browser (helpers/sim.ts). Each step is checked against the
// invariants: the panel follows a page it lists, no page follows unless asked by name, no page is
// asked by name unless the panel follows it, and no gap while nothing is lost.

test('a panel opened first follows the first page, and shows what it shows', () => {
  const sim = simulate();
  sim.openPanel();
  const t1 = sim.open('/');
  sim.settle();
  sim.change(t1);
  sim.change(t1);
  sim.settle();

  expect(sim.followed).toBe(t1);
  expect(sim.shown).toBe(2);
});

test('pages loaded before the panel: one row each, and only the one it follows follows', () => {
  const sim = simulate();
  const a = sim.open('/a');
  const b = sim.open('/b');
  sim.openPanel();
  sim.settle();

  expect([...sim.rows].sort()).toEqual([a, b]);
  const other = sim.followed === a ? b : a;
  expect(sim.mode(sim.followed!)).toBe('following');
  expect(sim.mode(other)).toBe('watched');
});

// The page it left still sends ops as it changes: the panel does not show them.
test('a picked page keeps the panel, and the page it left does not reach the view', () => {
  const sim = simulate();
  sim.openPanel();
  const a = sim.open('/a');
  const b = sim.open('/b');
  sim.settle();
  sim.pick(b);
  sim.settle();
  sim.change(b);
  sim.change(a);
  sim.settle();

  expect(sim.followed).toBe(b);
  expect(sim.shown).toBe(1);
});

// The last message lost shows only with the next one: nothing tells the panel until then.
test('an update lost on the way is noticed with the next one, and the tree fetched again', () => {
  const sim = simulate();
  sim.openPanel();
  const t1 = sim.open('/');
  sim.settle();
  sim.change(t1);
  sim.settle();
  sim.loseNext(t1);
  sim.change(t1);
  sim.settle();
  expect(sim.shown).toBe(1);

  sim.change(t1);
  sim.settle();

  expect(sim.gaps).toEqual([{ from: t1, expected: 6, got: 7 }]);
  expect(sim.shown).toBe(3);
});

// ── page continuity (the next step): today a reload or a closed tab leaves its row behind ──

// Today a reload or a closed tab leaves its row behind; page continuity is the next change.
test('today a page reloaded under the panel leaves its old row behind', () => {
  const sim = simulate();
  sim.openPanel();
  const t1 = sim.open('/');
  sim.settle();
  sim.reload(t1);
  sim.settle();

  expect(sim.rowsMatchTabs()).toBe('missing ; stale t1');
});

test('today a closed tab keeps its row', () => {
  const sim = simulate();
  sim.openPanel();
  sim.open('/a');
  const b = sim.open('/b');
  sim.settle();
  sim.close(b);
  sim.settle();

  expect(sim.rowsMatchTabs()).toBe(`missing ; stale ${b}`);
});

// ── orderings nobody wrote down ──

const URLS = ['/', '/a', '/b'];

function randomRun(seed: number, loss: number) {
  const sim = simulate({ seed, loss });
  const r = sim.rand;
  const any = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const panelAt = Math.floor(r() * 6);
  for (let i = 0; i < 80; i++) {
    if (i === panelAt) sim.openPanel();
    const tabs = sim.tabs;
    const roll = r();
    if (!tabs.length || roll < 0.08) sim.open(any(URLS));
    else if (roll < 0.55) sim.deliver(Math.floor(r() * 100));
    else if (roll < 0.75) sim.change(any(tabs));
    else if (roll < 0.82) sim.navigate(any(tabs), any(URLS));
    else if (roll < 0.87) sim.reload(any(tabs));
    else if (roll < 0.9 && tabs.length > 1) sim.close(any(tabs));
    else if (i > panelAt && sim.rows.length) sim.pick(any(sim.rows));
  }
  return sim;
}

test('200 random schedules with nothing lost keep the invariants, and show the followed page', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sim = randomRun(seed, 0);
    sim.settle();
    const f = sim.followed;
    if (f && sim.alive(f)) expect(sim.shown, `seed ${seed}`).toBe(sim.value(f));
  }
});

test('200 random schedules that lose a fifth of what pages send end showing the followed page', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sim = randomRun(seed, 0.2);
    sim.heal();
    const f = sim.followed;
    if (f && sim.alive(f))
      expect(sim.shown, `seed ${seed}\n${sim.log.join('\n')}`).toBe(sim.value(f));
  }
});

// A panel and a page that ask each other without end would pass as settled if settle() gave up.
test('a simulation that never settles is an error, not a pass', () => {
  const sim = simulate();
  sim.openPanel();
  const a = sim.open('/');
  sim.settle();
  sim.forever(() => sim.change(a));

  expect(() => sim.settle()).toThrow(/never settled/);
});
