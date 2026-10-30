// Theme system. Components reference CSS custom properties (--rs-*) which inherit from the
// <Panel>/<Inspect> root; this module owns the palettes and resolves 'auto' against the OS setting.
// Keeping it pure (resolveTheme/themeStyle take plain inputs) makes the resolution unit-testable.

export type ThemeSetting = 'auto' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';
export const THEMES: ThemeSetting[] = ['auto', 'dark', 'light'];

// VS Code-ish palettes. The accent is the orange of the icon's rune: darker on light, lighter on
// dark, so it reads both as text and under text.
const VARS: Record<ResolvedTheme, Record<string, string>> = {
  dark: {
    '--rs-bg': '#1e1e1e',
    '--rs-bg-elev': '#2d2d2d',
    '--rs-fg': '#e0e0e0',
    '--rs-border': '#444',
    '--rs-border-soft': '#333',
    '--rs-accent': '#fb923c',
    '--rs-on-accent': '#1e1e1e',
    '--rs-muted': '#888',
    '--rs-muted-2': '#6a6a6a',
    '--rs-name': '#4fc1ff',
    '--rs-sym': '#c586c0',
    '--rs-string': '#b5cea8',
    '--rs-key': '#9cdcfe',
  },
  light: {
    '--rs-bg': '#ffffff',
    '--rs-bg-elev': '#f3f3f3',
    '--rs-fg': '#1f1f1f',
    '--rs-border': '#c4c4c4',
    '--rs-border-soft': '#e2e2e2',
    '--rs-accent': '#c2410c',
    '--rs-on-accent': '#fff',
    '--rs-muted': '#6a6a6a',
    '--rs-muted-2': '#9a9a9a',
    '--rs-name': '#0070c1',
    '--rs-sym': '#af00db',
    '--rs-string': '#098658',
    '--rs-key': '#0451a5',
  },
};

export function resolveTheme(theme: ThemeSetting, systemDark: boolean): ResolvedTheme {
  if (theme === 'auto') return systemDark ? 'dark' : 'light';
  return theme;
}

// The shape a selected name and a flash share. The same in every theme.
const SHAPE: Record<string, string> = {
  '--rs-mark-radius': '6px',
  '--rs-mark-pad': '5px',
  '--rs-mark-pad-block': '2px',
};

// A CSS declaration string for the root element's `style` attribute, setting every --rs-* var.
export function themeStyle(resolved: ResolvedTheme): string {
  return Object.entries({ ...VARS[resolved], ...SHAPE })
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
