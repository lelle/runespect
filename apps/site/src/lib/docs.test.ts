import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { anchorsOf } from '../../../../scripts/check-docs.ts';
import { docPages, mermaidSources, pagerOf, renderDoc, sitePathOf } from './docs';
import { relativeHref } from './paths';
import { createCodeHighlighter } from './highlight';

// The docs pages are docs/*.md rendered at build time. Links between them must work on the site
// as they do on GitHub, so headings get GitHub's anchors and links to Markdown become site paths.

const docsDir = path.resolve(import.meta.dirname, '../../../../docs');
const read = (file: string) => readFileSync(path.join(docsDir, file), 'utf8');

test('serves each file under docs/ at its own path', () => {
  expect(sitePathOf('README.md')).toBe('docs/');
  expect(sitePathOf('how-to/troubleshoot.md')).toBe('docs/how-to/troubleshoot/');
});

test.each([
  ['docs/how-to/a/', 'docs/how-to/b/', '../b/'],
  ['docs/how-to/a/', 'docs/', '../../'],
  ['docs/', 'docs/reference/options/', 'reference/options/'],
  ['docs/', 'docs/', './'],
])('links from %s to %s as %s, without Node in the browser', (from, to, href) => {
  expect(relativeHref(from, to)).toBe(href);
});

test('gives headings the anchors GitHub gives them, and a link to each section', () => {
  const doc = renderDoc(
    '# Title\n\n## Nothing at all in the panel\n\n## `runespect()`: the dev server\n',
    'a.md',
  );
  expect(doc.title).toBe('Title');
  expect(doc.headings.map((h) => h.id)).toEqual([
    'nothing-at-all-in-the-panel',
    'runespect-the-dev-server',
  ]);
  expect(doc.html).toContain('<h2 id="nothing-at-all-in-the-panel">');
  expect(doc.html).toContain('href="#nothing-at-all-in-the-panel"');
});

test('turns a link to another doc into a relative path on the site', () => {
  const doc = renderDoc(
    '[a](../explanation/tiers.md#tier-1) [b](troubleshoot.md) [c](../README.md)',
    'how-to/use-the-extension.md',
  );
  expect(doc.html).toContain('href="../../explanation/tiers/#tier-1"');
  expect(doc.html).toContain('href="../troubleshoot/"');
  expect(doc.html).toContain('href="../../"');
});

test('sends a link to a file outside docs/ to GitHub, and leaves the web alone', () => {
  const doc = renderDoc(
    '[m](../../packages/extension/manifest.json) [p](../../PRIVACY.md) [d](../../packages/ui) [w](https://diataxis.fr/)',
    'how-to/use-the-extension.md',
  );
  expect(doc.html).toContain(
    'href="https://github.com/lelle/runespect/blob/main/packages/extension/manifest.json"',
  );
  expect(doc.html).toContain('href="https://github.com/lelle/runespect/blob/main/PRIVACY.md"');
  expect(doc.html).toContain('href="https://github.com/lelle/runespect/tree/main/packages/ui"');
  expect(doc.html).toContain('href="https://diataxis.fr/"');
});

test('colours code by its language, and marks a block to copy', async () => {
  const highlight = await createCodeHighlighter();
  const doc = renderDoc('```ts\nconst x = 1;\n```\n', 'a.md', highlight);
  expect(doc.html).toContain('<pre data-copy><code><span class="t-keyword">const</span>');
});

test('puts a drawn diagram in place of its Mermaid block', () => {
  const source = '```mermaid\nflowchart TB\n  a --> b\n```\n';
  const drawn = renderDoc(source, 'a.md', undefined, (code) =>
    code.startsWith('flowchart') ? '<svg>drawn</svg>' : undefined,
  );
  expect(drawn.html).toContain('<figure class="diagram"><svg>drawn</svg></figure>');
  expect(drawn.html).not.toContain('<pre');
});

test('lists the overview, then the menu in order, and pages each one to its neighbours', () => {
  const pages = docPages(read);
  expect(pages[0]).toMatchObject({ file: 'README.md', name: 'Overview', group: 'Docs' });
  expect(pages[1]).toMatchObject({ file: 'tutorials/getting-started.md', group: 'Tutorials' });
  const { prev, next } = pagerOf('tutorials/getting-started.md', pages);
  expect(prev?.file).toBe('README.md');
  expect(next?.file).toBe('how-to/use-with-sveltekit.md');
  expect(pagerOf('README.md', pages).prev).toBeUndefined();
});

// Node 20, which the packages support, has no fs.globSync.
const docsFiles = readdirSync(docsDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('.md'),
);

test.each(docsFiles)('%s has on the site the anchors it has on GitHub', (file) => {
  const source = read(file);
  const ids = [...renderDoc(source, file).html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((m) => m[1]);
  expect(ids).toEqual(anchorsOf(source));
});

// The build draws every diagram once, up front; a fence it does not find is a page that shows the
// Mermaid source as code, with no error.
test('finds every diagram the page renders, however its fence is written', () => {
  const source = [
    '# Page',
    '',
    '```mermaid',
    'flowchart TB',
    '  a --> b',
    '```',
    '',
    '- a list item',
    '',
    '  ```mermaid',
    '  flowchart TB',
    '    c --> d',
    '  ```',
    '',
    '~~~mermaid',
    'flowchart TB',
    '  e --> f',
    '~~~',
    '',
  ].join('\r\n');
  const asked: string[] = [];
  renderDoc(source, 'page.md', undefined, (code) => {
    asked.push(code);
    return undefined;
  });
  expect(asked).toHaveLength(3);
  expect(mermaidSources(source)).toEqual(asked);
});
