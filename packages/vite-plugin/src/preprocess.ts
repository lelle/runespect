import { parse } from 'svelte/compiler';
import { componentName } from '@runespect/agent/protocol/internal';
import MagicString from 'magic-string';
import type { PreprocessorGroup, Processed } from 'svelte/compiler';
import {
  AGENT_RUNTIME,
  DEV_SERVER_FLAG,
  agentCall,
  isNeverInstrumented,
  skipUnreadable,
  symbolsSource,
} from './instrument.ts';
import type { FoundSymbol } from './instrument.ts';
import { componentSymbols } from './symbols.ts';

// The component half of runespect: a Svelte preprocessor that registers each component in the
// tree and reports its values to the agent, with code written in Svelte's public API.

// RegExp.test() on a /g or /y regex starts where the last match ended.
function matches(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

type MarkupInput = Parameters<NonNullable<PreprocessorGroup['markup']>>[0];

export interface RunespectPreprocessOptions {
  /** Only files whose path matches are instrumented. Default: every `.svelte` file. */
  include?: RegExp;
  /**
   * Instrument even when {@link runespect} is not serving the app, e.g. `true` in tests.
   * A production build is never instrumented.
   */
  enabled?: boolean;
}

/**
 * Instruments each component so its state, deriveds, props and stores are reported to the agent.
 * Runs only while {@link runespect} serves the app, unless `enabled` says otherwise. Files under
 * `node_modules` and `.svelte-kit` are never instrumented.
 */
export function runespectPreprocess(
  options: RunespectPreprocessOptions = {},
): Omit<PreprocessorGroup, 'markup'> & { markup(input: MarkupInput): Processed | undefined } {
  const include = options.include ?? /\.svelte$/;

  return {
    name: 'runespect-instrument',
    markup({ content, filename }) {
      // Same production test as vitePreprocess: `vite build` sets NODE_ENV before preprocessing.
      if (process.env.NODE_ENV === 'production') return;
      if (!(options.enabled ?? process.env[DEV_SERVER_FLAG] === '1')) return;
      // Never instrument library components or SvelteKit's generated root; otherwise respect the
      // include filter.
      if (filename && (isNeverInstrumented(filename) || !matches(include, filename))) return;

      try {
        return instrumentComponent(content, filename);
      } catch {
        skipUnreadable(
          filename ?? 'a component',
          'If it needs another preprocessor first, put runespectPreprocess() last in the list.',
        );
        return;
      }
    },
  };
}

/**
 * The instrumentation {@link runespectPreprocess} applies, without its checks: for a build that
 * instruments on purpose, such as the project site's demo. `loc` is the location the panel shows
 * and opens in the editor; it defaults to `filename`.
 */
export function instrumentComponent(
  content: string,
  filename: string | undefined,
  options: { loc?: string } = {},
): Processed {
  // Parsed with the styles blanked: until vitePreprocess has run, a <style lang="scss"> is not CSS
  // and would stop the parse. Same length, so every position still points into `content`.
  const ast: any = parse(
    content.replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g,
      (_, open, css, close) => open + css.replace(/[^\n]/g, ' ') + close,
    ),
    { filename, modern: true },
  );
  const instance = ast.instance;
  // Every matched component is registered (tree completeness), even with no reactive surface and
  // even with no <script> at all.
  const { symbols, snippets } = componentSymbols(ast);

  const name = componentName(filename);

  const imports = `\nimport * as __runespect from ${JSON.stringify(AGENT_RUNTIME)};\n`;

  const instrument = buildInstrument(name, symbols, snippets, options.loc ?? filename);

  // Use MagicString so line numbers in the original source survive the insertions —
  // the returned sourcemap keeps debugging/errors pointing at the real lines.
  const s = new MagicString(content);
  if (instance) {
    s.appendLeft(instance.content.start, imports);
    s.appendLeft(instance.content.end, instrument);
  } else {
    // No <script>: inject one so the component still joins the tree.
    s.prepend(`<script>${imports}${instrument}</script>\n`);
  }

  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, hires: true, includeContent: true }),
  };
}

function buildInstrument(
  componentName: string,
  symbols: FoundSymbol[],
  snippets: string[],
  loc: string | undefined,
): string {
  const descriptor = [
    `name: ${JSON.stringify(componentName)}`,
    ...(loc ? [`loc: ${JSON.stringify(loc)}`] : []),
    ...(snippets.length ? [`snippets: ${JSON.stringify(snippets)}`] : []),
    `symbols: ${symbolsSource(symbols)}`,
  ];
  return `\n\n// ── injected by @runespect/vite-plugin ──\n${agentCall('component', `{ ${descriptor.join(', ')} }`)};\n`;
}
