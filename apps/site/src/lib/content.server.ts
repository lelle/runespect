import { docPages, mermaidSources, pagerOf, renderDoc, type DocPage } from './docs';
import { renderDiagrams } from './diagrams';
import { createCodeHighlighter } from './highlight';

// docs/*.md at the repository root, bundled into the build so prerendering reads no files.
const DOCS_PREFIX = '../../../../docs/';
const sources = import.meta.glob('../../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const read = (file: string): string => {
  const source = sources[DOCS_PREFIX + file];
  if (source === undefined) throw new Error(`docs/${file} is in the menu but does not exist`);
  return source;
};

export const pages: DocPage[] = docPages(read);
const highlight = await createCodeHighlighter();

// Every Mermaid block in the docs, drawn once for the whole build.
const diagramSources = [...new Set(Object.values(sources).flatMap(mermaidSources))];
const drawn = new Map(
  (await renderDiagrams(diagramSources)).map((svg, i) => [diagramSources[i], svg]),
);

/** The page served at `path` under docs/ (`''` is the index), or undefined. */
export function loadDoc(path: string) {
  const trimmed = path.replace(/\/$/, '');
  const page = pages.find((p) => p.path === `docs/${trimmed ? `${trimmed}/` : ''}`);
  if (!page) return undefined;
  // The index is "Docs" on the site, as in the bar; GitHub keeps its own title.
  const source = read(page.file);
  const doc = renderDoc(
    page.file === 'README.md' ? source.replace(/^# .*$/m, '# Docs') : source,
    page.file,
    highlight,
    (code) => drawn.get(code),
  );
  return { page, doc, pager: pagerOf(page.file, pages) };
}
