import { test, expect } from 'vitest';
import { checkChangesets } from './check-changesets.ts';

// The release strategy in .changeset/README.md, as executable rules: a change a user of the npm
// packages or the extension would notice brings a changeset, and nothing is released as 1.0 by
// accident while the packages are 0.x.

const packages = {
  'packages/agent': { name: '@runespect/agent', version: '0.1.1' },
  'packages/extension': { name: '@runespect/extension', version: '0.1.1' },
};

const changeset = (frontmatter: string) => ({
  file: '.changeset/some-change.md',
  text: `---\n${frontmatter}---\n\nWhat changed.\n`,
});

test('a change to a package with a changeset for it passes', () => {
  expect(
    checkChangesets({
      changed: ['packages/agent/src/dom.ts', '.changeset/some-change.md'],
      changesets: [changeset("'@runespect/agent': patch\n")],
      packages,
    }),
  ).toEqual([]);
});

test('a change to a package without a changeset names the package', () => {
  const problems = checkChangesets({
    changed: ['packages/agent/src/dom.ts'],
    changesets: [],
    packages,
  });

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('@runespect/agent');
  expect(problems[0]).toContain('pnpm changeset --empty');
});

test('a changeset for another package does not cover it', () => {
  expect(
    checkChangesets({
      changed: ['packages/agent/src/dom.ts', 'packages/extension/src/panel.ts'],
      changesets: [changeset("'@runespect/extension': patch\n")],
      packages,
    }),
  ).toEqual([expect.stringContaining('@runespect/agent')]);
});

test('an empty changeset says users will not notice, for every package', () => {
  expect(
    checkChangesets({
      changed: ['packages/agent/src/dom.ts', 'packages/extension/src/panel.ts'],
      changesets: [changeset('')],
      packages,
    }),
  ).toEqual([]);
});

test('changes outside the packages, and the changelogs they write, need no changeset', () => {
  expect(
    checkChangesets({
      changed: [
        'docs/how-to/add-the-overlay.md',
        'apps/playground/test/x.test.ts',
        'packages/agent/CHANGELOG.md',
      ],
      changesets: [],
      packages,
    }),
  ).toEqual([]);
});

test('a major bump before 1.0 is refused: it would release 1.0.0', () => {
  const problems = checkChangesets({
    changed: ['packages/agent/src/dom.ts'],
    changesets: [changeset('"@runespect/agent": major\n')],
    packages,
  });

  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('.changeset/some-change.md');
  expect(problems[0]).toContain('minor');
});
