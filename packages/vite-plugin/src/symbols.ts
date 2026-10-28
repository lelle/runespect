import type { SymbolKind } from '@runespect/agent/protocol/internal';
import type { FoundSymbol } from './instrument.ts';

// What a file reports to the agent, and which of its symbols the panel may write: one answer for a
// component and for a module, read from the parsed source. The callers parse and inject; nothing here
// imports Svelte or Vite.

const STATE = '$state';
const DERIVED = '$derived';
const REACTIVITY = 'svelte/reactivity';
// Runes are allowed only in these files, so a class imported from one may be reactive. The marker is
// the prefilter's cheap form of the pattern.
const SVELTE_SOURCE = /\.svelte(\.(js|ts))?$/;
const SVELTE_FILE = '.svelte';
// Everything a module reports is declared with one of these, so a module without any is not parsed.
// Detection reads the same constants, so a new marker cannot be detected without the prefilter
// learning it.
const MODULE_MARKERS = [STATE, DERIVED, REACTIVITY, SVELTE_FILE];

/** What a component reports. `ast` is svelte/compiler parse(…, { modern: true }); it is only read. */
export function componentSymbols(ast: any): { symbols: FoundSymbol[]; snippets: string[] } {
  const instance = ast.instance;
  // Values are reported with code that is legal in the component's own mode. What is read without a
  // rune is reported in every mode: contexts, what setContext provides, instances of imported
  // classes, and stores. A component with neither runes nor legacy syntax reports only those, and
  // its stores through their own subscription, because any other reporting code would decide its
  // mode for it.
  const mode = componentMode(ast);
  const collected: Collected = { ...NOTHING_TO_REPORT };
  if (instance) {
    // A runes component may export state for its parent to read; it is reported like any other.
    const runes = collectRunes(
      mode === 'runes' ? { body: unwrapExports(instance.content).body } : instance.content,
    );
    const { contexts, contextSets, importedInstances } = runes;
    Object.assign(
      collected,
      mode === 'runes' ? runes : { contexts, contextSets, importedInstances },
    );
    if (mode === 'legacy') Object.assign(collected, collectLegacy(instance.content));
    const stores = collectStores(instance.content, ast.fragment, ast.module?.content);
    if (mode === 'tree') collected.watchedStores = stores;
    else collected.stores = stores;
  }
  // Only a module may not reassign what it exports, so a component's exports stay writable.
  return { symbols: toSymbols(collected, new Set()), snippets: collectSnippets(ast.fragment) };
}

/** What a `.svelte.ts`/`.svelte.js` module reports. `program` is its ESTree, after type stripping. */
export function moduleSymbols(program: any): FoundSymbol[] {
  const { body, exported } = unwrapExports(program);
  const { states, reassignableStates, deriveds, classFields, importedInstances } = collectRunes({
    body,
  });
  return toSymbols(
    { ...NOTHING_TO_REPORT, states, reassignableStates, deriveds, classFields, importedInstances },
    exported,
  );
}

/** False when `code` cannot declare anything {@link moduleSymbols} reports, so it need not be parsed. */
export function mayReportModule(code: string): boolean {
  return MODULE_MARKERS.some((marker) => code.includes(marker));
}

// `export const x = $state(…)` declares x like any other top-level declaration.
function unwrapExports(program: any): { body: any[]; exported: Set<string> } {
  const exported = new Set<string>();
  const body = program.body.map((node: any) => {
    if (node.type !== 'ExportNamedDeclaration') return node;
    for (const spec of node.specifiers ?? []) exported.add(spec.local.name);
    if (!node.declaration) return node;
    for (const name of topLevelNames({ body: [node.declaration] })) exported.add(name);
    return node.declaration;
  });
  return { body, exported };
}

// Each symbol is an expression (a bare id, `box.value`, or `$store`) that reads it and, when it may be
// edited, is assigned to.
function toSymbols(collected: Collected, exported: ReadonlySet<string>): FoundSymbol[] {
  const {
    states,
    reassignableStates,
    deriveds,
    props,
    bindables,
    classFields,
    importedInstances,
    stores,
    contexts,
    contextSets,
    watchedStores,
  } = collected;
  const classExprs = classFields.map((f) => f.expr);
  const writableClassExprs = classFields.filter((f) => f.writable).map((f) => f.expr);
  // A symbol in more than one list takes the kind of the last.
  const found = new Map<string, FoundSymbol>();
  const add = (symbol: string, kind: SymbolKind, spec: Partial<FoundSymbol> = {}) =>
    found.set(symbol, { ...found.get(symbol), symbol, kind, ...spec });
  for (const n of states) add(n, 'state', { read: n });
  for (const n of deriveds) add(n, 'derived', { read: n });
  for (const n of props) add(n, 'prop', { read: n });
  for (const n of classExprs) add(n, 'class', { read: n });
  for (const n of importedInstances) add(n, 'class', { read: n });
  for (const n of stores) add(n, 'store', { read: n });
  for (const n of contexts) add(n, 'context', { read: n });
  // setContext(key, value) calls are reported together as one `provided` object so a key that
  // matches a state/prop name can't collide with it in the values map.
  if (contextSets.length) {
    const obj = contextSets.map((c) => `${JSON.stringify(c.keyLabel)}: ${c.valSource}`).join(', ');
    add('provided', 'context-set', { read: `({ ${obj} })` });
  }
  for (const n of watchedStores) add(n, 'store', { store: n.slice(1) });
  // Stores, contexts and deriveds stay read-only. Svelte refuses to compile a module that reassigns
  // state it exports, so that is read-only too; a field of an exported instance is not the export,
  // and stays writable.
  const reassignable = reassignableStates.filter((n) => !exported.has(n));
  for (const n of [...reassignable, ...bindables, ...writableClassExprs]) {
    const symbol = found.get(n);
    if (symbol) symbol.write = n;
  }
  return [...found.values()];
}

// What a component reports: names (or expressions, like `box.value` and `$store`) per kind.
interface Collected {
  states: string[];
  reassignableStates: string[];
  deriveds: string[];
  props: string[];
  bindables: string[];
  classFields: { expr: string; writable: boolean }[];
  importedInstances: string[];
  stores: string[];
  contexts: string[];
  contextSets: { keyLabel: string; valSource: string }[];
  watchedStores: string[];
}

const NOTHING_TO_REPORT: Collected = {
  states: [],
  reassignableStates: [],
  deriveds: [],
  props: [],
  bindables: [],
  classFields: [],
  importedInstances: [],
  stores: [],
  contexts: [],
  contextSets: [],
  watchedStores: [],
};

type ComponentMode = 'runes' | 'legacy' | 'tree';

// Mirrors how Svelte picks a component's mode: <svelte:options runes>, else runes if any rune is used.
function componentMode(ast: any): ComponentMode {
  const option = ast.options?.runes;
  if (option === true) return 'runes';
  const scripts = [ast.instance?.content, ast.module?.content].filter(Boolean);
  if (option !== false && scripts.some(usesRunes)) return 'runes';
  if (option === false || scripts.some(hasLegacySyntax)) return 'legacy';
  return 'tree';
}

function usesRunes(program: any): boolean {
  let found = false;
  visit(program, (n) => {
    if (n.type === 'Identifier' && RUNE_IDENTIFIERS.has(n.name)) found = true;
    return !found;
  });
  return found;
}

function hasLegacySyntax(program: any): boolean {
  return program.body.some(
    (node: any) =>
      (node.type === 'LabeledStatement' && node.label.name === '$') ||
      (node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'VariableDeclaration' &&
        node.declaration.kind === 'let'),
  );
}

// Legacy values: `export let` props, top-level `let` (reactive in legacy mode) and names assigned by
// `$: x = ...`.
function collectLegacy(program: any) {
  const props: string[] = [];
  const states: string[] = [];
  const deriveds: string[] = [];
  for (const node of program.body) {
    if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'VariableDeclaration' &&
      node.declaration.kind === 'let'
    ) {
      for (const d of node.declaration.declarations) props.push(...patternNames(d.id));
    } else if (node.type === 'VariableDeclaration' && node.kind === 'let') {
      for (const d of node.declarations) states.push(...patternNames(d.id));
    } else if (
      node.type === 'LabeledStatement' &&
      node.label.name === '$' &&
      node.body.type === 'ExpressionStatement' &&
      node.body.expression.type === 'AssignmentExpression' &&
      node.body.expression.left.type === 'Identifier'
    ) {
      const name = node.body.expression.left.name;
      if (!props.includes(name) && !states.includes(name)) deriveds.push(name);
    }
  }
  return { props, states, deriveds };
}

// Detect store auto-subscriptions: `$foo` read where `foo` is declared or imported at the top of the
// component. Keys, member names and types that merely start with `$` are not stores.
function collectStores(program: any, fragment: any, moduleProgram?: any): string[] {
  const declared = new Set([...topLevelNames(program), ...topLevelNames(moduleProgram)]);
  const names = new Set<string>();
  const collect = (n: any, parent: any, key: string): boolean => {
    if (typeof n.type === 'string' && n.type.startsWith('TS')) return false;
    if (
      n.type === 'Identifier' &&
      /^\$[A-Za-z_][\w$]*$/.test(n.name) &&
      !RUNE_IDENTIFIERS.has(n.name) &&
      declared.has(n.name.slice(1)) &&
      !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) &&
      !(parent?.type === 'Property' && key === 'key' && !parent.computed)
    ) {
      names.add(n.name);
    }
    return true;
  };
  visit(program, collect);
  visit(fragment, collect);
  return [...names];
}

// Walk the markup fragment for {#snippet name(...)} declarations.
function collectSnippets(fragment: any): string[] {
  const names = new Set<string>();
  visit(fragment, (n) => {
    if (n.type === 'SnippetBlock' && n.expression?.name) names.add(n.expression.name);
  });
  return [...names];
}

function collectRunes(program: any) {
  const states: string[] = [];
  const reassignableStates: string[] = []; // `let` state: the only state a setter may assign
  const deriveds: string[] = [];
  const props: string[] = [];
  const bindables: string[] = []; // subset of props that are $bindable() → two-way writable
  const contexts: string[] = []; // `const x = getContext(key)` — context the component consumes
  const contextSets: { keyLabel: string; valSource: string }[] = []; // setContext(key, value) — provides
  const reactiveClasses = new Map<string, { name: string; writable: boolean }[]>(); // className -> [{ name, writable }]
  const instances: { varName: string; className: string }[] = []; // { varName, className }
  const reactivity = importedFrom(program, REACTIVITY); // SvelteSet, SvelteMap, …
  const svelteFiles = importedFrom(program, SVELTE_SOURCE);
  const importedInstances: string[] = [];

  for (const node of program.body) {
    // setContext(key, value) at component init — capture what context this component provides, but
    // only when both key and value are safe to re-read in an $effect (identifier or literal); a
    // value that's a call/new would re-run its side effects, so skip it.
    if (node.type === 'ExpressionStatement' && node.expression?.type === 'CallExpression') {
      const call = node.expression;
      if (
        call.callee.type === 'Identifier' &&
        call.callee.name === 'setContext' &&
        call.arguments.length === 2
      ) {
        const [keyArg, valArg] = call.arguments;
        const keyLabel =
          keyArg.type === 'Literal'
            ? String(keyArg.value)
            : keyArg.type === 'Identifier'
              ? keyArg.name
              : null;
        const valSource =
          valArg.type === 'Identifier'
            ? valArg.name
            : valArg.type === 'Literal'
              ? (valArg.raw ?? JSON.stringify(valArg.value))
              : null;
        if (keyLabel != null && valSource != null) contextSets.push({ keyLabel, valSource });
      }
      continue;
    }

    if (node.type === 'ClassDeclaration' && node.id) {
      const fields: { name: string; writable: boolean }[] = [];
      for (const m of node.body.body) {
        // `box.name` must be valid source: a computed or string key ('a-b') would not be.
        if (m.type !== 'PropertyDefinition' || m.computed || m.key?.type !== 'Identifier') continue;
        const base = runeBase(unwrapTs(m.value));
        if (base === STATE) fields.push({ name: m.key.name, writable: true });
        else if (base === DERIVED) fields.push({ name: m.key.name, writable: false });
      }
      if (fields.length) reactiveClasses.set(node.id.name, fields);
      continue;
    }

    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      const init = unwrapTs(d.init);
      if (!init) continue;

      if (init.type === 'NewExpression' && d.id.type === 'Identifier') {
        // A SvelteSet or SvelteMap is reactive in itself: its value is the state, never reassigned.
        if (isFrom(reactivity, init)) states.push(d.id.name);
        // A class declared elsewhere: its fields are not known here, so the instance is one value,
        // which the panel opens to the fields it holds.
        else if (isFrom(svelteFiles, init)) importedInstances.push(d.id.name);
        else if (init.callee.type === 'Identifier')
          instances.push({ varName: d.id.name, className: init.callee.name });
        continue;
      }
      if (init.type !== 'CallExpression') continue;

      // Map both bare runes ($state) and member runes ($state.raw, $derived.by) to
      // their base rune via the callee object name.
      const base = runeBase(init);

      if (base === '$props' && d.id.type === 'Identifier') {
        props.push(d.id.name); // `let props = $props()`: the whole bag as one value
      } else if (base === DERIVED && d.id.type !== 'Identifier') {
        deriveds.push(...patternNames(d.id)); // `let [a, b] = $derived(…)`
      } else if (base === '$props' && d.id.type === 'ObjectPattern') {
        for (const p of d.id.properties) {
          if (p.type !== 'Property') continue; // skip RestElement (...rest)
          const v = p.value;
          if (v.type === 'Identifier') {
            props.push(v.name);
          } else if (v.type === 'AssignmentPattern' && v.left.type === 'Identifier') {
            props.push(v.left.name);
            if (isBindable(v.right) && node.kind !== 'const') bindables.push(v.left.name);
          }
        }
      } else if (d.id.type === 'Identifier') {
        if (base === STATE) {
          states.push(d.id.name);
          if (node.kind !== 'const') reassignableStates.push(d.id.name);
        } else if (base === DERIVED) deriveds.push(d.id.name);
        else if (base === 'getContext') contexts.push(d.id.name);
      }
    }
  }

  // Expand instances of locally-declared reactive classes into dotted field accessors.
  const classFields: { expr: string; writable: boolean }[] = [];
  for (const inst of instances) {
    const fields = reactiveClasses.get(inst.className);
    if (!fields) continue;
    for (const f of fields)
      classFields.push({ expr: `${inst.varName}.${f.name}`, writable: f.writable });
  }

  return {
    states,
    reassignableStates,
    deriveds,
    props,
    bindables,
    classFields,
    importedInstances,
    contexts,
    contextSets,
  };
}

// What a program imports from `source` at runtime: its named imports under their aliases, and its
// namespaces (`import * as R`). A type-only import is no class to construct.
function importedFrom(program: any, source: string | RegExp) {
  const matches = (value: string): boolean =>
    typeof source === 'string' ? value === source : source.test(value);
  const names = new Set<string>();
  const namespaces = new Set<string>();
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration' || !matches(node.source.value)) continue;
    if (node.importKind === 'type') continue;
    for (const spec of node.specifiers) {
      if (spec.importKind === 'type') continue;
      (spec.type === 'ImportNamespaceSpecifier' ? namespaces : names).add(spec.local.name);
    }
  }
  return { names, namespaces };
}

// `new SvelteSet()` or `new R.SvelteSet()` of a class `imported` names.
function isFrom(imported: ReturnType<typeof importedFrom>, call: any): boolean {
  const c = call.callee;
  if (c.type === 'Identifier') return imported.names.has(c.name);
  return (
    c.type === 'MemberExpression' &&
    c.object.type === 'Identifier' &&
    imported.namespaces.has(c.object.name)
  );
}

// Base rune name from a CallExpression callee: $state from `$state(...)` or `$state.raw(...)`.
// `$state.snapshot(x)` returns a plain copy; the other members ($state.raw, $derived.by) are runes.
function runeBase(call: any): string | null {
  if (!call || call.type !== 'CallExpression') return null;
  const c = call.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && c.object.type === 'Identifier') {
    return c.property?.name === 'snapshot' ? null : c.object.name;
  }
  return null;
}

// `$state<T>()!`, `$state(0) as number` and `… satisfies T` wrap the rune call in TypeScript.
function unwrapTs(node: any): any {
  while (node && /^TS(As|NonNull|Satisfies)Expression$|^TSTypeAssertion$/.test(node.type)) {
    node = node.expression;
  }
  return node;
}

const RUNE_IDENTIFIERS = new Set([
  STATE,
  DERIVED,
  '$props',
  '$effect',
  '$inspect',
  '$host',
  '$bindable',
]);

function topLevelNames(program: any): string[] {
  const names: string[] = [];
  for (const node of program?.body ?? []) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) names.push(spec.local.name);
    } else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) names.push(...patternNames(d.id));
    } else if (
      (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') &&
      node.id
    ) {
      names.push(node.id.name);
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      names.push(...topLevelNames({ body: [node.declaration] }));
    }
  }
  return names;
}

function patternNames(pattern: any): string[] {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern')
    return pattern.properties.flatMap((p: any) =>
      patternNames(p.type === 'RestElement' ? p.argument : p.value),
    );
  if (pattern.type === 'ArrayPattern') return pattern.elements.flatMap(patternNames);
  if (pattern.type === 'AssignmentPattern') return patternNames(pattern.left);
  if (pattern.type === 'RestElement') return patternNames(pattern.argument);
  return [];
}

function isBindable(node: any): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === '$bindable'
  );
}

/**
 * Walks an ESTree / Svelte AST depth-first, calling `visitor` with each node, its parent and the key
 * it sits under. Returning false skips the node's children. `parent` links are not followed.
 */
function visit(
  node: any,
  visitor: (node: any, parent: any, key: string) => boolean | void,
  parent: any = null,
  key = '',
): void {
  if (!node || typeof node !== 'object') return;
  if (visitor(node, parent, key) === false) return;
  for (const k in node) {
    if (k === 'parent') continue;
    const child = node[k];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c === 'object') visit(c, visitor, node, k);
    } else if (child && typeof child === 'object') visit(child, visitor, node, k);
  }
}
