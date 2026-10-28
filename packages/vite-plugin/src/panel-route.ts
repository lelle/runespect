/** Where the standalone panel window is served from, on the app's own dev server, below its `base`. */
export const PANEL_ROUTE = '/__runespect';

const routeUnder = (base: string): string => base.replace(/\/$/, '') + PANEL_ROUTE;

// Which file inside panel-dist a request maps to, or null when the request is not ours. The panel
// is a single page, so a path without a file extension gets index.html. Anything that tries to
// climb out of the bundle, with either separator, is refused rather than resolved — this serves
// files off disk.
export function panelAssetPath(url: string, base = '/'): string | null {
  const [pathname] = url.split('?');
  const route = routeUnder(base);
  if (pathname !== route && !pathname.startsWith(`${route}/`)) return null;
  const rest = pathname.slice(route.length).replace(/^\//, '');
  if (rest.split(/[\\/]/).includes('..')) return null;
  if (!/\.[^/]+$/.test(rest)) return 'index.html';
  return rest;
}

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
};

// The panel's files are sent with readFile, so each needs its type named. No node:path here: the
// panel bundle imports this module in the browser.
export function panelContentType(file: string): string {
  const extension = /\.([^./]+)$/.exec(file)?.[1] ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

// The bundle loads its assets relative to the page, so the route must end in a slash: without it,
// `./assets/…` resolves to the app's /assets/.
export function panelRedirect(url: string, base = '/'): string | null {
  const [pathname, query] = url.split(/\?(.*)/s);
  if (pathname !== routeUnder(base)) return null;
  return `${pathname}/${query === undefined ? '' : `?${query}`}`;
}

// The panel is prebuilt, so it cannot know the app's base; the path it was served under says it.
export function viteClientUrl(panelPathname: string): string {
  return panelPathname.slice(0, panelPathname.indexOf(PANEL_ROUTE)) + '/@vite/client';
}
