import { pages } from '#lib/content.server.ts';
import { SITE_URL } from '#lib/paths.ts';
import { sitemapXml } from '#lib/sitemap.ts';

export const prerender = true;

// The demo is its own build, copied in after this one, so it is listed by hand.
export const GET = () =>
  new Response(sitemapXml(SITE_URL, ['', 'demo/', ...pages.map((page) => page.path)]), {
    headers: { 'content-type': 'application/xml' },
  });
