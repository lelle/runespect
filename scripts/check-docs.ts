// Checks the Markdown docs the project site is built from: the menu in docs/README.md, the links
// between files, and passages repeated across files.
import { existsSync } from 'node:fs';
import { posix } from 'node:path';

const GROUPS_START = '## The four kinds of docs';
const SITE_DOCS = 'https://lelle.github.io/runespect/docs/';
const RUN = 12;

interface MenuGroup {
  name: string;
  pages: { name: string; file: string }[];
}

const withoutCode = (markdown: string): string => markdown.replaceAll(/```[\s\S]*?```/g, '');

/** The groups under the four kinds in docs/README.md, and the pages each lists. */
export function readMenu(readme: string): MenuGroup[] {
  const groups: MenuGroup[] = [];
  const start = readme.indexOf(GROUPS_START);
  if (start < 0) return groups;
  for (const line of readme.slice(start).split('\n')) {
    const group = /^### (.+?)(?: — .*)?$/.exec(line);
    if (group) groups.push({ name: group[1], pages: [] });
    const page = /^- \[([^\]]+)\]\(([^)#]+\.md)(?:#[^)]*)?\)/.exec(line);
    if (page && groups.length > 0) groups.at(-1)!.pages.push({ name: page[1], file: page[2] });
  }
  return groups;
}

/** The anchor GitHub gives a heading with this text, before it numbers repeats. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(' ', '-');
}

/** The anchor of every heading, as GitHub makes them. */
export function anchorsOf(markdown: string): string[] {
  const seen = new Map<string, number>();
  return [...withoutCode(markdown).matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => {
    const slug = slugify(heading);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  });
}

/**
 * The relative links in `text` (the file at `file`) that lead nowhere. A link to Markdown is
 * checked against `files`, anchor included; any other path against the disk.
 */
export function brokenLinks(
  file: string,
  text: string,
  files: Map<string, string>,
  exists: (path: string) => boolean = existsSync,
): string[] {
  const broken: string[] = [];
  const inline = withoutCode(text).replaceAll(/`[^`\n]*`/g, '');
  for (const [, href] of inline.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(href)) continue;
    const [target, anchor] = href.split('#');
    const path = target ? posix.normalize(posix.join(posix.dirname(file), target)) : file;
    if (path.endsWith('.md')) {
      const linked = path === file ? text : files.get(path);
      if (linked === undefined || (anchor && !anchorsOf(linked).includes(anchor))) {
        broken.push(href);
      }
    } else if (!exists(path.replace(/\/$/, ''))) {
      broken.push(href);
    }
  }
  return broken;
}

/** Where a docs address on the project site comes from, or null for any other address. */
export function siteDocFile(url: string): { file: string; anchor?: string } | null {
  if (!url.startsWith(SITE_DOCS)) return null;
  const [path, anchor] = url.slice(SITE_DOCS.length).split('#');
  const page = path.replace(/\/$/, '');
  return { file: page ? `docs/${page}.md` : 'docs/README.md', anchor: anchor || undefined };
}

/** Passages of twelve or more words in a row that appear in more than one file. */
export function findRepeats(files: Map<string, string>): { files: string[]; text: string }[] {
  const runs = new Map<string, Set<string>>();
  const paragraphs = new Map<string, string[][]>();
  for (const [file, text] of files) {
    paragraphs.set(file, paragraphsOf(text));
    for (const words of paragraphs.get(file)!) {
      for (let i = 0; i + RUN <= words.length; i++) {
        const run = words.slice(i, i + RUN).join(' ');
        if (!runs.has(run)) runs.set(run, new Set());
        runs.get(run)!.add(file);
      }
    }
  }

  const repeats = new Map<string, { files: string[]; text: string }>();
  for (const words of [...paragraphs.values()].flat()) {
    let start = -1;
    let shared = '';
    const close = (end: number): void => {
      if (start < 0) return;
      const text = words.slice(start, end + RUN - 1).join(' ');
      repeats.set(`${shared}\n${text}`, { files: shared.split('\n'), text });
      start = -1;
    };
    for (let i = 0; i + RUN <= words.length; i++) {
      const found = runs.get(words.slice(i, i + RUN).join(' '))!;
      const key = [...found].toSorted().join('\n');
      if (found.size < 2 || key !== shared) close(i);
      if (found.size >= 2 && start < 0) [start, shared] = [i, key];
    }
    close(words.length - RUN + 1);
  }
  return [...repeats.values()];
}

// Code blocks are left out: a how-to shows the commands it needs.
function paragraphsOf(markdown: string): string[][] {
  return withoutCode(markdown)
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        paragraph
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('#'))
          .join(' ')
          .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .toLowerCase()
          .match(/[\w@$<>-]+(?:[./][\w@$<>-]+)*/g) ?? [],
    );
}
