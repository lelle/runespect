import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

// Every page runespect serves takes the extension's 32 px icon, the bare rune, as its favicon.
export const RUNE_FAVICON = readFileSync(
  path.resolve(import.meta.dirname, '../packages/extension/public/icons/icon-32.png'),
).toString('base64');

/**
 * The bytes of the page's favicon as base64, whether it is a file or inlined as a data: url, or
 * null when there is none or it is not served as an image (a browser may then not show it).
 */
export function faviconOf(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) return null;
    const response = await fetch(link.href);
    if (!response.headers.get('content-type')?.startsWith('image/')) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
  });
}
