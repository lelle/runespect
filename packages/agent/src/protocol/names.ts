const ROUTE_FILE = /^\+(page|layout|error)$/;

/**
 * The tree's name for a component: its file name, and for a SvelteKit route file its route, as in
 * `+page (blog/[slug])`. The plugin names what it instruments with it, and the extension's DOM walk
 * what it finds, so both sides call a component the same.
 */
export function componentName(filename: string | undefined): string {
  if (!filename) return 'Component';
  const parts = filename.split(/[\\/]/);
  const base = parts.at(-1)!.replace(/\.svelte$/, '');
  const routes = parts.lastIndexOf('routes');
  if (!ROUTE_FILE.test(base) || routes === -1) return base;
  return `${base} (${parts.slice(routes + 1, -1).join('/') || '/'})`;
}
