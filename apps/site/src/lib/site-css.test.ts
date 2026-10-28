import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(import.meta.dirname, 'site.css'), 'utf8');

// The light and dark value of a `--name: light-dark(light, dark)` or `--name: value` declaration
// in the first :root block.
function schemeValues(name: string): { light: string; dark: string } {
  const value = css.match(new RegExp(`${name}:\\s*([^;]+);`))![1].trim();
  const pair = value.match(/^light-dark\(\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\s*\)$/i);
  return pair ? { light: pair[1], dark: pair[2] } : { light: value, dark: value };
}

function relativeLuminance(hex: string) {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The accent fills the primary button under --on-accent text, and colours links and the secondary
// button on the page background; both need the 4.5 contrast WCAG asks of normal text.
test.each(['light', 'dark'] as const)('the %s accent reads as text and under text', (scheme) => {
  const accent = schemeValues('--accent')[scheme];
  expect(contrastRatio(schemeValues('--on-accent')[scheme], accent)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(accent, schemeValues('--bg')[scheme])).toBeGreaterThanOrEqual(4.5);
});
