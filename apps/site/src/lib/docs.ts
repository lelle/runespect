import { Marked, type Tokens } from 'marked';
import { posix } from 'node:path';
import { readMenu, slugify } from '../../../../scripts/check-docs.ts';
import type { Highlight } from './highlight';
import { REPO, relativeHref } from './paths';

const INDEX = 'README.md';

interface Heading {
  id: string;
  html: string;
}

export interface RenderedDoc {
  title: string;
  html: string;
  /** The second-level headings, in order: what the menu lists under the page. */
  headings: Heading[];
}

export interface DocPage {
  file: string;
  /** Where the page is on the site, relative to its root. */
  path: string;
  name: string;
  group: string;
}

/** Where a file under docs/ is served on the site, relative to its root. */
export function sitePathOf(file: string): string {
  if (file === INDEX) return 'docs/';
  return `docs/${file.replace(/\.md$/, '')}/`;
}

/** The overview, then every page in docs/README.md's menu, in order. */
export function docPages(read: (file: string) => string): DocPage[] {
  const menu = readMenu(read(INDEX)) as { name: string; pages: { name: string; file: string }[] }[];
  return [
    { file: INDEX, path: sitePathOf(INDEX), name: 'Overview', group: 'Docs' },
    ...menu.flatMap((group) =>
      group.pages.map((page) => ({ ...page, path: sitePathOf(page.file), group: group.name })),
    ),
  ];
}

/** The pages either side of `file`, in menu order. */
export function pagerOf(file: string, pages: DocPage[]): { prev?: DocPage; next?: DocPage } {
  const at = pages.findIndex((page) => page.file === file);
  if (at === -1) return {};
  return { prev: pages[at - 1], next: pages[at + 1] };
}

/**
 * `file` is the page's path under docs/; it decides where its links lead. Without `highlight`,
 * code blocks are plain; `diagram` gives the drawn SVG of a Mermaid block.
 */
export function renderDoc(
  source: string,
  file: string,
  highlight?: Highlight,
  diagram?: (code: string) => string | undefined,
): RenderedDoc {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  let title = '';

  const marked = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = unescapeHtml(html.replaceAll(/<[^>]*>/g, ''));
        const base = slugify(text);
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen === 0 ? base : `${base}-${seen}`;
        if (depth === 1 && !title) title = text;
        if (depth === 2) headings.push({ id, html });
        const anchor =
          depth === 1
            ? ''
            : ` <a class="anchor" href="#${id}" aria-label="Link to this section">#</a>`;
        return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`;
      },
      link({ href, title: linkTitle, tokens }) {
        const titled = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
        return `<a href="${escapeHtml(siteHref(href, file))}"${titled}>${this.parser.parseInline(tokens)}</a>`;
      },
      // Long names break at their own seams, not mid-word.
      codespan({ text }) {
        return `<code>${escapeHtml(text).replaceAll(/([./])/g, '$1<wbr>')}</code>`;
      },
      code({ text, lang }: Tokens.Code) {
        const language = languageOf(lang);
        const drawn = language === 'mermaid' ? diagram?.(text) : undefined;
        if (drawn) return `<figure class="diagram">${drawn}</figure>\n`;
        const body = highlight?.(text, language) ?? escapeHtml(text);
        // A diagram or a printed result is read, not pasted, so it gets no copy button.
        const copy = language ? ' data-copy' : '';
        return `<pre${copy}><code>${body}</code></pre>\n`;
      },
    },
  });

  const html = marked.parse(source, { async: false });
  return { title, html, headings };
}

/** The source of every Mermaid block in `source`, as renderDoc asks for its drawing. */
export function mermaidSources(source: string): string[] {
  const found: string[] = [];
  const marked = new Marked();
  marked.walkTokens(marked.lexer(source), (token) => {
    if (token.type === 'code' && languageOf(token.lang) === 'mermaid') found.push(token.text);
  });
  return found;
}

const languageOf = (lang: string | undefined): string => /^\S*/.exec(lang ?? '')![0];

function siteHref(href: string, file: string): string {
  if (/^[a-z][a-z+.-]*:/i.test(href) || href.startsWith('#')) return href;
  const hashAt = href.indexOf('#');
  const target = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const inRepo = posix
    .normalize(posix.join('docs', posix.dirname(file), target))
    .replace(/\/$/, '');

  if (inRepo.startsWith('docs/') && inRepo.endsWith('.md')) {
    return `${relativeHref(sitePathOf(file), sitePathOf(inRepo.slice('docs/'.length)))}${hash}`;
  }
  const kind = posix.extname(inRepo) ? 'blob' : 'tree';
  return `${REPO}/${kind}/main/${inRepo}${hash}`;
}

const ENTITIES: Record<string, string> = {
  '&#39;': "'",
  '&amp;': '&',
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
};

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function unescapeHtml(text: string): string {
  return text.replaceAll(/&(?:#39|amp|gt|lt|quot);/g, (entity) => ENTITIES[entity]!);
}
