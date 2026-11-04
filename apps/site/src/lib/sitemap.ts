const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A sitemap of `paths`, each relative to `site` (an absolute address ending in `/`). */
export function sitemapXml(site: string, paths: string[]): string {
  const urls = paths.map((path) => `  <url><loc>${escapeXml(site + path)}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
