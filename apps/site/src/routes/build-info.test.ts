import { test, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { load } from './+layout.server';

// The footer says whether main is ahead of the release. It is read at build time, which may run
// from the repository root (vitest, an IDE) as well as from apps/site.
test('the build info finds the changesets wherever the build runs from', () => {
  const changesets = readdirSync(path.resolve(import.meta.dirname, '../../../../.changeset'));
  const waiting = changesets.some((name) => name.endsWith('.md') && name !== 'README.md');
  const data = load({} as never) as { build: { unreleased: boolean } };
  expect(data.build.unreleased).toBe(waiting);
});
