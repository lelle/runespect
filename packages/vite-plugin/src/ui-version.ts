import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The plugin hands the overlay its own agent, whose internals change from release to release, so
// @runespect/ui only works next to the plugin it was released with.

const versionAt = (manifest: string): string => JSON.parse(readFileSync(manifest, 'utf8')).version;

// The app's @runespect/ui, found as Node finds a package: in node_modules here or in a folder above.
function appUiVersion(root: string): string | undefined {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'node_modules/@runespect/ui/package.json');
    if (existsSync(manifest)) return versionAt(manifest);
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** A warning when the app has another version of @runespect/ui than this plugin; else nothing. */
export function uiVersionProblem(root: string): string | undefined {
  const ui = appUiVersion(root);
  const plugin = versionAt(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'),
  );
  if (ui === undefined || ui === plugin) return undefined;
  return (
    `[runespect] @runespect/ui ${ui} does not match @runespect/vite-plugin ${plugin}: ` +
    'install the same version of both.'
  );
}
