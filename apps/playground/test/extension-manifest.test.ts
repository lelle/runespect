import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import manifest from '../../../packages/extension/manifest.json';

// The playground's own directory, wherever the test runner was started from.
const PLAYGROUND = path.join(import.meta.dirname, '..');

// Every API permission adds a line to Chrome's install warning; the extension needs none.
test('the extension asks for no API permissions, now or later', () => {
  const asked = [
    ...((manifest as { permissions?: string[] }).permissions ?? []),
    ...((manifest as { optional_permissions?: string[] }).optional_permissions ?? []),
  ];
  expect(asked).toEqual([]);
});

// The store refuses an extension without a 128 px icon, and Chrome scales a wrong-sized one into a
// blur. Each icon the manifest names is a PNG of the size it is listed under.
const pngSize = (file: string): [number, number] => {
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)]; // the IHDR chunk follows the signature
};
const extensionFile = (relative: string) =>
  path.resolve(PLAYGROUND, '../../packages/extension/public', relative);

test('every icon the manifest names exists, at the size it is listed under', () => {
  expect(Object.keys(manifest.icons)).toEqual(expect.arrayContaining(['16', '32', '48', '128']));
  for (const [size, file] of Object.entries(manifest.icons)) {
    expect(pngSize(extensionFile(file)), file).toEqual([Number(size), Number(size)]);
  }
});

// The PNGs are rendered from icon.png and icon-small.png and committed, with the hash of their
// sources; an edited source whose PNGs were not rendered again would ship the old icon.
test('the icon PNGs were rendered from the current icon.png and icon-small.png', () => {
  const hash = createHash('sha256');
  for (const source of ['icon.png', 'icon-small.png']) {
    hash.update(readFileSync(path.resolve(PLAYGROUND, '../../packages/extension/icons', source)));
  }
  const rendered = readFileSync(
    path.resolve(PLAYGROUND, '../../packages/extension/icons/rendered-from.sha256'),
    'utf8',
  ).trim();
  expect(rendered).toBe(hash.digest('hex'));
});

// `world: "MAIN"` in a content script needs Chrome 111; on 110 the names-only script would run in the
// isolated world, where `__svelte_meta` cannot be seen.
test('the minimum Chrome version covers the features the manifest uses', () => {
  const usesMainWorld = manifest.content_scripts.some(
    (script) => (script as { world?: string }).world === 'MAIN',
  );
  const needed = usesMainWorld ? 111 : 0;
  expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(needed);
});
