import { decode } from '@jridgewell/sourcemap-codec';
import { componentName } from '@runespect/agent/protocol/internal';
import { parseModule, collect } from './analyze.js';

// With sourcemaps (build.sourcemap: true) we can name the otherwise-anonymous prod components and
// their fields. `sources` tells us which .svelte file each generated region came from (→ component
// name), and `sourcesContent` embeds the original .svelte text (→ field names, read straight from
// the `$state`/`$derived` declarations — robust, since the map's `names` array is usually empty and
// position lookups can land on a literal).
export interface RawSourceMap {
  sources: (string | null)[];
  mappings: string;
  names?: string[];
  sourcesContent?: (string | null)[];
}

// fn (minified) -> the source index it maps to, via a position inside each top-level function body.
function componentSourceIndex(code: string, map: RawSourceMap): Map<string, number> {
  const out = new Map<string, number>();
  if (!map?.mappings) return out;
  const lines = decode(map.mappings);

  const indexAt = (line0: number, col: number): number | null => {
    const segs = lines[line0];
    if (!segs?.length) return null;
    let best: number[] | null = null;
    for (const s of segs) {
      if (s[0] <= col && s.length >= 2) best = s;
      else if (s[0] > col) break;
    }
    return best ? best[1] : null;
  };

  const ast = parseModule(code);
  for (const fn of collect(ast, 'FunctionDeclaration')) {
    if (!fn.id || !fn.body) continue;
    // a position INSIDE the body — the name token can land on the previous region's boundary
    const inner = fn.body.body?.[0] ?? fn.body;
    const loc = inner.loc?.start;
    if (!loc) continue;
    const idx = indexAt(loc.line - 1, loc.column);
    if (idx != null) out.set(fn.id.name, idx);
  }
  return out;
}

// fn -> component name (source basename, minus .svelte)
export function componentNamesFromSourcemap(code: string, map: RawSourceMap): Map<string, string> {
  const out = new Map<string, string>();
  for (const [fn, idx] of componentSourceIndex(code, map)) {
    const src = map.sources[idx];
    if (src) out.set(fn, componentName(src));
  }
  return out;
}

const DECLARATION =
  /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*\$(state|derived)\b/g;
const RUNE_CALL = /\$(?:state(?:\.raw)?|derived(?:\.by)?)\s*\(/g;

// The names of a component's $state and $derived signals, in the order the compiled output creates
// them, or null when the source does not say. Values are matched to names by position, and a wrong
// name on a value is worse than none:
// - a $state that is never reassigned compiles to a plain value or a proxy, not a signal, so it is
//   left out of the list;
// - a rune anywhere but a plain declaration (a class field, a destructured $derived) makes a signal
//   the source cannot place, so no names are given at all.
export function runeFieldNames(source: string): { state: string[]; derived: string[] } | null {
  const declarations = [...source.matchAll(DECLARATION)];
  if (declarations.length !== [...source.matchAll(RUNE_CALL)].length) return null;
  const rest = source.replace(DECLARATION, ' $$$2');
  const state: string[] = [];
  const derived: string[] = [];
  for (const [, name, rune] of declarations) {
    if (rune === 'derived') derived.push(name);
    else if (isReassigned(rest, name)) state.push(name);
  }
  return { state, derived };
}

function isReassigned(source: string, name: string): boolean {
  const n = name.replace(/\$/g, '\\$');
  const not = '(?<![\\w$.])';
  return new RegExp(
    `${not}${n}\\s*(?:[-+*/%&|^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?![=>])` +
      `|(?:\\+\\+|--)\\s*${n}(?![\\w$])|${not}${n}\\s*(?:\\+\\+|--)` +
      `|bind:[\\w-]+=\\{\\s*${n}\\s*\\}`,
  ).test(source);
}

// fn -> its ordered field names (from sourcesContent). Empty if the map has no sourcesContent.
export function componentFieldsFromSourcemap(
  code: string,
  map: RawSourceMap,
): Map<string, { state: string[]; derived: string[] }> {
  const out = new Map<string, { state: string[]; derived: string[] }>();
  if (!map?.sourcesContent) return out;
  for (const [fn, idx] of componentSourceIndex(code, map)) {
    const content = map.sourcesContent[idx];
    const fields = content ? runeFieldNames(content) : null;
    if (fields) out.set(fn, fields);
  }
  return out;
}
