import MagicString from 'magic-string';
import {
  AGENT_RUNTIME,
  agentCall,
  isNeverInstrumented,
  symbolsSource,
  skipUnreadable,
} from './instrument.ts';
import { mayReportModule, moduleSymbols } from './symbols.ts';

const MODULE_FILE = /\.svelte\.(js|ts)$/;

/**
 * Instruments a `.svelte.ts`/`.svelte.js` module so its top-level state, deriveds, rune-class
 * instances and svelte/reactivity collections are reported under "Modules" in the tree, and a private `let` state can be edited.
 * `code` is the module after type stripping; `parse` gives its ESTree program. Null when there is
 * nothing to report. Used by runespect(); exported internally for tests.
 */
export function instrumentModule(
  code: string,
  id: string,
  parse: (code: string) => any,
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  const filename = id.split('?')[0];
  if (!MODULE_FILE.test(filename) || isNeverInstrumented(filename)) return null;
  if (!mayReportModule(code)) return null; // most modules are skipped unparsed
  let program;
  try {
    program = parse(code);
  } catch {
    return skipUnreadable(filename);
  }
  const found = moduleSymbols(program);
  if (!found.length) return null;
  const descriptor = `{ file: ${JSON.stringify(filename)}, symbols: ${symbolsSource(found)} }`;
  const lines = [
    '',
    '// ── injected by @runespect/vite-plugin ──',
    `import * as __runespect from ${JSON.stringify(AGENT_RUNTIME)};`,
    `${agentCall('module', descriptor, 'import.meta.hot')};`,
    '',
  ];
  const s = new MagicString(code);
  s.append(lines.join('\n'));
  return { code: s.toString(), map: s.generateMap({ source: filename }) };
}
