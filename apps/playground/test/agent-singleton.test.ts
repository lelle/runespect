import { test, expect, vi } from 'vitest';

// The agent holds the tree in module state. A second copy (two versions installed, or one bundled
// into a dependency) would split the tree without a sound, so loading one says so.
test('a second copy of the agent warns that the tree is split', async () => {
  await import('@runespect/agent/internal');
  vi.resetModules();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await import('@runespect/agent/internal');
    expect(warn.mock.calls.some(([m]) => String(m).includes('second copy of the agent'))).toBe(
      true,
    );
  } finally {
    warn.mockRestore();
  }
});
