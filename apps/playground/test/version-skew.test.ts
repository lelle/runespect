import { test, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { runespect } from '@runespect/vite-plugin';

// The plugin hands the overlay its own agent, so @runespect/ui only works next to the plugin it was
// released with. The dev server says so when the app has another version of it.
const { version: pluginVersion } = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../../packages/vite-plugin/package.json'),
    'utf8',
  ),
);

function appWith(uiVersion?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'runespect-skew-'));
  if (uiVersion) {
    const ui = path.join(root, 'node_modules/@runespect/ui');
    mkdirSync(ui, { recursive: true });
    writeFileSync(
      path.join(ui, 'package.json'),
      JSON.stringify({ name: '@runespect/ui', version: uiVersion }),
    );
  }
  return root;
}

function warningsFor(root: string): string[] {
  const warn = vi.fn();
  const hook = (runespect() as Plugin).configResolved as {
    handler: (config: ResolvedConfig) => void;
  };
  hook.handler({ root, plugins: [], logger: { warn } } as unknown as ResolvedConfig);
  return warn.mock.calls.map(([message]) => message as string);
}

test('another version of @runespect/ui in the app is named in a warning', () => {
  expect(warningsFor(appWith('0.0.9'))).toEqual([
    `[runespect] @runespect/ui 0.0.9 does not match @runespect/vite-plugin ${pluginVersion}: ` +
      'install the same version of both.',
  ]);
});

test('the same version, or no @runespect/ui at all, is not worth a word', () => {
  expect(warningsFor(appWith(pluginVersion))).toEqual([]);
  expect(warningsFor(appWith())).toEqual([]);
});

test('@runespect/ui installed in a folder above the app counts too, as in a workspace', () => {
  const workspace = appWith('0.0.9');
  const app = path.join(workspace, 'apps/shop');
  mkdirSync(app, { recursive: true });

  expect(warningsFor(app)).toHaveLength(1);
});
