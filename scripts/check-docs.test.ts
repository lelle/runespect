import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { anchorsOf, brokenLinks, findRepeats, readMenu, siteDocFile } from './check-docs.ts';
import { TIER_DOCS_URL, TROUBLESHOOTING_URL } from '../packages/ui/src/status.ts';

// The docs are organised by what the reader wants to do (tutorials, how-to, reference,
// explanation), and docs/README.md is the menu the project site is built from. These checks keep
// every page reachable, every link alive, and every fact in one place.

const MENU = `# docs

## Start here

- [Not a menu entry](tutorials/a.md)

## The four kinds of docs

### Tutorials — learning by doing

- [A](tutorials/a.md) — the first one.

### How-to guides — task-focused

- [B](how-to/b.md)
- [C](how-to/c.md#part)
`;

test('reads the groups and pages under the four kinds', () => {
  expect(readMenu(MENU)).toEqual([
    { name: 'Tutorials', pages: [{ name: 'A', file: 'tutorials/a.md' }] },
    {
      name: 'How-to guides',
      pages: [
        { name: 'B', file: 'how-to/b.md' },
        { name: 'C', file: 'how-to/c.md' },
      ],
    },
  ]);
});

test('makes anchors from headings the way GitHub does', () => {
  const text = [
    '# Troubleshooting',
    '## Nothing at all in the panel',
    '## The panel says "Tier 1 — component names only"',
    '### `runespectPreprocess()`: components',
    '```sh',
    '# not a heading',
    '```',
  ].join('\n');
  expect(anchorsOf(text)).toEqual([
    'troubleshooting',
    'nothing-at-all-in-the-panel',
    'the-panel-says-tier-1--component-names-only',
    'runespectpreprocess-components',
  ]);
});

test('reports a link to a missing file, and to a missing anchor', () => {
  const files = new Map([
    ['docs/how-to/b.md', '# B\n\n## Part one\n'],
    ['docs/README.md', ''],
  ]);
  const text = [
    '[ok](b.md) [ok](b.md#part-one) [ok](#top) [ok](../README.md) [web](https://example.com)',
    '[gone](c.md) [no anchor](b.md#part-two)',
    '```md',
    '[in code](nowhere.md)',
    '```',
  ].join('\n');
  expect(brokenLinks('docs/how-to/a.md', `# Top\n${text}`, files)).toEqual([
    'c.md',
    'b.md#part-two',
  ]);
});

test('checks a link to a directory or a file that is not Markdown by its existence', () => {
  const files = new Map([['docs/README.md', '']]);
  const exists = (path: string) => path === 'packages/ui' || path === 'LICENSE';
  expect(
    brokenLinks('README.md', '[d](packages/ui) [l](LICENSE) [x](nope/)', files, exists),
  ).toEqual(['nope/']);
});

test('finds twelve words in a row in two files, and leaves code blocks alone', () => {
  const shared = 'one two three four five six seven eight nine ten eleven twelve';
  const files = new Map([
    ['a.md', `# A\n\nBefore. ${shared} thirteen.\n`],
    ['b.md', `# B\n\n${shared}\n\n\`\`\`sh\n${shared} again\n\`\`\`\n`],
    ['c.md', `\`\`\`sh\n${shared}\n\`\`\`\n`],
  ]);
  expect(findRepeats(files)).toEqual([{ files: ['a.md', 'b.md'], text: shared }]);
});

test('maps a docs address on the site to its file', () => {
  expect(
    siteDocFile('https://lelle.github.io/runespect/docs/how-to/troubleshoot/#nothing-at-all'),
  ).toEqual({ file: 'docs/how-to/troubleshoot.md', anchor: 'nothing-at-all' });
  expect(siteDocFile('https://lelle.github.io/runespect/docs/')).toEqual({
    file: 'docs/README.md',
    anchor: undefined,
  });
  expect(siteDocFile('https://github.com/lelle/runespect')).toBeNull();
});

// ── the repository's own docs ──

const docsPages = (): string[] =>
  readdirSync('docs', { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/${file}`);

const markdown = (): Map<string, string> =>
  new Map(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter((file) => existsSync(file) && !file.startsWith('.changeset/'))
      .map((file) => [file, readFileSync(file, 'utf8')]),
  );

test('lists every page under docs/ in the menu', () => {
  const listed = readMenu(readFileSync('docs/README.md', 'utf8')).flatMap((group) =>
    group.pages.map((page) => `docs/${page.file}`),
  );
  const written = docsPages().filter((file) => file !== 'docs/README.md');
  expect(listed.toSorted()).toEqual(written.toSorted());
});

test('explains each fact in one file, and links to it from the others', () => {
  const files = new Map(
    [...markdown()].filter(
      ([file]) => file.startsWith('docs/') || /^(packages\/[^/]+\/)?README\.md$/.test(file),
    ),
  );
  expect(findRepeats(files)).toEqual([]);
});

test('every link between the Markdown files leads to a file and an anchor that exist', () => {
  const files = markdown();
  const broken = [...files].flatMap(([file, text]) =>
    brokenLinks(file, text, files).map((href) => `${file}: ${href}`),
  );
  expect(broken).toEqual([]);
});

test.each([
  ['the tier link', TIER_DOCS_URL],
  ['the troubleshooting link', TROUBLESHOOTING_URL],
])('%s in the panel leads to a docs page on the site', (_, url) => {
  const target = siteDocFile(url);
  expect(target).not.toBeNull();
  expect(existsSync(target!.file)).toBe(true);
  if (target!.anchor)
    expect(anchorsOf(readFileSync(target!.file, 'utf8'))).toContain(target!.anchor);
});
