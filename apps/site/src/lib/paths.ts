// What the browser needs too: no Node built-ins here.

export const REPO = 'https://github.com/lelle/runespect';

/**
 * A link from one site path to another, both relative to the site's root and ending in `/`. The
 * menu works it out in the browser too, where there is no node:path.
 */
export function relativeHref(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);
  let shared = 0;
  while (shared < fromParts.length && fromParts[shared] === toParts[shared]) shared++;
  const relative = [...fromParts.slice(shared).map(() => '..'), ...toParts.slice(shared)].join('/');
  return relative ? `${relative}/` : './';
}
