import { test, expect } from 'vitest';
import { panelStatus, TIER_DOCS_URL, TROUBLESHOOTING_URL } from '@runespect/ui/internal';

const base = { panelVersion: 2, hasTree: true, graceElapsed: true } as const;

test("the app's own plugin is shown as a plain, non-alarming status", () => {
  expect(panelStatus({ ...base, tier: 0 })).toMatchObject({ level: 'ok', label: 'Tier 0' });
});

// A capture reads Svelte's private runtime: it can miss values or name them wrongly on any Svelte
// minor, and it cannot edit. The status must not call that "ok".
test('a capture is shown as experimental and read-only, with where to read more', () => {
  const status = panelStatus({ ...base, tier: 2 });
  expect(status).toMatchObject({ level: 'warn', label: 'Experimental' });
  expect(status.detail).toMatch(/read-only/);
  expect(status.docsUrl).toBeTruthy();
});

test('a tree with no reported tier is Tier 1: names only, and where to read more', () => {
  const status = panelStatus({ ...base, tier: null });
  expect(status.level).toBe('warn');
  expect(status.label).toBe('Tier 1');
  expect(status.detail).toMatch(/no live state/i);
  expect(status.docsUrl).toBe(TIER_DOCS_URL);
});

test('before the grace period is up, a tier-less tree is still "connecting" — a slow Tier 0 must not flash as Tier 1', () => {
  expect(panelStatus({ ...base, tier: null, graceElapsed: false }).level).toBe('waiting');
  expect(panelStatus({ ...base, tier: null, hasTree: false, graceElapsed: false }).level).toBe(
    'waiting',
  );
});

test('a protocol mismatch outranks every tier — it explains why nothing else can be trusted', () => {
  const overTier0 = panelStatus({ ...base, tier: 0, mismatchVersion: 1 });
  expect(overTier0.level).toBe('warn');
  expect(overTier0.label).toMatch(/mismatch/i);
  expect(overTier0.detail).toContain('page v1');
  expect(overTier0.detail).toContain('panel v2');

  expect(panelStatus({ ...base, tier: null, mismatchVersion: 1 }).label).toMatch(/mismatch/i);
});

test('a capture that stopped says why', () => {
  const status = panelStatus({ ...base, tier: 2, problem: 'Svelte internals not recognised' });
  expect(status).toMatchObject({ level: 'warn', label: 'Capture stopped' });
  expect(status.detail).toContain('Svelte internals not recognised');
});

// The panel window has no Tier-1 fallback: when the agent never loads (a moved entry, a missing
// plugin), "Connecting…" forever reads as slow rather than broken.
test('when nothing has answered after the grace period, the status says so and where to look', () => {
  const status = panelStatus({ ...base, tier: null, hasTree: false });
  expect(status.level).toBe('warn');
  expect(status.docsUrl).toBe(TROUBLESHOOTING_URL);
});
