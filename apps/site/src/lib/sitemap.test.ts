import { test, expect } from 'vitest';
import { sitemapXml } from './sitemap';

// Search engines read the sitemap to find pages nothing links to yet, so every address in it has to
// be absolute and valid XML.

test('lists each page as an absolute address under the site', () => {
  const xml = sitemapXml('https://example.org/runespect/', ['', 'docs/', 'docs/how-to/a/']);
  expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])).toEqual([
    'https://example.org/runespect/',
    'https://example.org/runespect/docs/',
    'https://example.org/runespect/docs/how-to/a/',
  ]);
  expect(xml).toMatch(
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/,
  );
});

test('escapes what XML does not allow in an address', () => {
  expect(sitemapXml('https://example.org/', ['a&b/'])).toContain(
    '<loc>https://example.org/a&amp;b/</loc>',
  );
});
