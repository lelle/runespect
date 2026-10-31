import { readFileSync } from 'node:fs';
import path from 'node:path';
import type * as Runtime from '@runespect/agent/runtime';
import type { SymbolKind } from '@runespect/agent/protocol/internal';

// What the component preprocessor and the module transform share: where the injected code imports
// the agent from, what is never instrumented, and how the runes of a script are found.

// Both the injected code and the plugin's broadcast import the agent's runtime from here. It is not
// a public entry: @runespect/agent is released together with this package.
export const AGENT_RUNTIME = '@runespect/agent/runtime';

// Set by runespect() while it serves an app, read by runespectPreprocess() and the module transform.
// An environment variable rather than module state, because svelte.config.js can load this package
// as a separate instance.
export const DEV_SERVER_FLAG = 'RUNESPECT_DEV_SERVER';

// Set by runespect({ includeInRelease: true }) while it builds an app, to the project root.
export const RELEASE_ROOT_FLAG = 'RUNESPECT_RELEASE_ROOT';

/** The path to report for a file: from the project root in a build, so the machine that built it stays out of it. */
export function reportedPath(filename: string): string {
  const root = process.env[RELEASE_ROOT_FLAG];
  return root ? path.relative(root, filename).replaceAll(path.sep, '/') : filename;
}

// A file runespect cannot read is left as it is: runespect adds to an app and never breaks it. Told
// once per file, since the dev server compiles it again on every change.
const warned = new Set<string>();
export function skipUnreadable(filename: string, hint = ''): null {
  if (!warned.has(filename)) {
    warned.add(filename);
    console.warn(
      `[runespect] could not read ${filename}, so it runs without runespect.${hint && ` ${hint}`}`,
    );
  }
  return null;
}

const NEVER_INSTRUMENTED = ['node_modules', '.svelte-kit'];

/** Library code, SvelteKit's generated files, and runespect itself are never instrumented. */
export function isNeverInstrumented(filename: string): boolean {
  return (
    NEVER_INSTRUMENTED.some((dir) => filename.includes(dir)) ||
    isRunespectPackage(path.dirname(filename))
  );
}

// runespect's own files (the agent, the panel, the overlay) are outside node_modules in a workspace
// or when linked; instrumenting them would report the devtools as part of the app. Decided by the
// nearest package.json, once per directory.
const runespectDirs = new Map<string, boolean>();
function isRunespectPackage(dir: string): boolean {
  const known = runespectDirs.get(dir);
  if (known !== undefined) return known;
  let found: boolean;
  try {
    const { name } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    found = typeof name === 'string' && name.startsWith('@runespect/');
  } catch {
    const parent = path.dirname(dir);
    found = parent !== dir && isRunespectPackage(parent);
  }
  runespectDirs.set(dir, found);
  return found;
}

// What the injected code may call: the agent's runtime entry. Every call is written through
// agentCall, so a function the runtime renames or drops fails this package's type check, not the
// app at runtime.
export const agentCall = (fn: keyof typeof Runtime, ...args: string[]): string =>
  `__runespect.${fn}(${args.join(', ')})`;

// What the plugin found in a file, one entry per symbol: what it is, and the source expressions
// that read it, set it, or (a store read through its own subscription) are it. The agent does the
// rest; the expressions stay in the app's file, because Svelte must compile them there.
export interface FoundSymbol {
  symbol: string;
  kind: SymbolKind;
  read?: string;
  write?: string;
  store?: string;
}

/** The `symbols` object of a runtime descriptor, as source. */
export function symbolsSource(symbols: FoundSymbol[]): string {
  const specs = symbols.map(({ symbol, kind, read, write, store }) => {
    const parts = [`kind: ${JSON.stringify(kind)}`];
    if (store) parts.push(`store: ${store}`);
    if (read) parts.push(`read: () => ${read}`);
    if (write) parts.push(`write: (v) => { ${write} = v; }`);
    return `${JSON.stringify(symbol)}: { ${parts.join(', ')} }`;
  });
  return `{ ${specs.join(', ')} }`;
}
