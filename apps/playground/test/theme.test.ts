import { test, expect } from 'vitest';
import { resolveTheme, themeStyle } from '@runespect/ui/internal';

test('resolveTheme: auto follows the OS; explicit dark/light wins', () => {
  expect(resolveTheme('auto', true)).toBe('dark');
  expect(resolveTheme('auto', false)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
  expect(resolveTheme('light', true)).toBe('light');
});

test('themeStyle: emits the core --rs vars, distinct per theme', () => {
  const dark = themeStyle('dark');
  expect(dark).toContain('--rs-bg:#1e1e1e');
  expect(dark).toContain('--rs-fg:#e0e0e0');

  const light = themeStyle('light');
  expect(light).toContain('--rs-bg:#ffffff');
  expect(light).toContain('--rs-fg:#1f1f1f');
});

function relativeLuminance(color: string) {
  const hex = color.length === 4 ? color.replace(/[0-9a-f]/gi, '$&$&') : color;
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

// The accent fills buttons and the change flash under --rs-on-accent text, and colours links on
// the panel background; both need the 4.5 contrast WCAG asks of normal text.
test.each(['dark', 'light'] as const)('the %s accent reads as text and under text', (theme) => {
  const vars = Object.fromEntries(
    themeStyle(theme)
      .split(';')
      .map((d) => d.split(':')),
  );
  expect(contrastRatio(vars['--rs-on-accent'], vars['--rs-accent'])).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(vars['--rs-accent'], vars['--rs-bg'])).toBeGreaterThanOrEqual(4.5);
});
