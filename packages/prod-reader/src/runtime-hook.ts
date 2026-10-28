import {
  parseModule,
  collect,
  fingerprintRoles,
  readProdNodeChunk,
  type TreeNode,
} from './analyze.js';
import {
  componentNamesFromSourcemap,
  componentFieldsFromSourcemap,
  type RawSourceMap,
} from './sourcemap.js';

// Runtime-hook half: read LIVE values from a prod build by wrapping the bundled runtime chunk's
// mangled state/derived exports — the same redirect trick as dev capture, retargeted from the
// `svelte/internal/client` import (inlined in a build) to a chunk import. The tests run it on the
// minified Svelte runtime in test/fixtures.

export interface HookTargets {
  chunkRef: string; // the relative chunk specifier the node module imports the runtime from
  exports: { state?: string; derived?: string; get?: string; set?: string };
}

// Map the fingerprinted local roles back to the runtime chunk's mangled EXPORT names (what a
// wrapper overrides). The local letters vary per build; we read them from the node chunk's import.
export function resolveHookTargets(nodeChunk: string): HookTargets {
  const ast = parseModule(nodeChunk);
  const roles = fingerprintRoles(ast);

  const byLocal = new Map<string, { chunk: string; exported: string }>();
  for (const imp of collect(ast, 'ImportDeclaration')) {
    const src = imp.source.value;
    if (typeof src !== 'string' || !src.includes('chunks/')) continue;
    for (const spec of imp.specifiers) {
      if (spec.type === 'ImportSpecifier')
        byLocal.set(spec.local.name, { chunk: src, exported: spec.imported.name });
    }
  }
  const ex = (local?: string) => (local ? byLocal.get(local)?.exported : undefined);
  const chunkRef = roles.state ? byLocal.get(roles.state)?.chunk : undefined;

  return {
    chunkRef: chunkRef ?? '',
    exports: {
      state: ex(roles.state),
      derived: ex(roles.derived),
      get: ex(roles.get),
      set: ex(roles.set),
    },
  };
}

export interface RecordedSignal {
  kind: 'state' | 'derived';
  read: () => unknown;
}
export interface WrappedRuntime {
  state: (...a: unknown[]) => unknown;
  derived: (...a: unknown[]) => unknown;
  get: (s: unknown) => unknown;
  set: (s: unknown, v: unknown) => unknown;
}

// Wrap a runtime module namespace so state()/derived() record the created signal; each recorded
// entry reads its LIVE value via the runtime's own get(). Must stay self-contained (no module-scope
// references) — it is serialized into the injected wrapper via Function.prototype.toString().
export function wrapRuntime(
  real: Record<string, (...a: unknown[]) => unknown>,
  exports: HookTargets['exports'],
  sink: RecordedSignal[],
): WrappedRuntime {
  const get = real[exports.get as string] as (s: unknown) => unknown;
  // The roles come from fingerprinting a minified build. If one does not resolve to a function,
  // the page keeps the real runtime and the panel is told why there is nothing.
  const roles = [exports.state, exports.derived, exports.get] as string[];
  const missing = roles.filter((k) => typeof real[k] !== 'function');
  if (missing.length) {
    const g = globalThis as { __RS_CAPTURE__?: { problem?: string } };
    (g.__RS_CAPTURE__ ??= {}).problem =
      `Svelte runtime not recognised (no function at ${missing.join(', ')}), so nothing is captured.`;
    return {
      state: real[exports.state as string],
      derived: real[exports.derived as string],
      get,
      set: real[exports.set as string] as (s: unknown, v: unknown) => unknown,
    };
  }
  const mk =
    (name: string, kind: 'state' | 'derived') =>
    (...args: unknown[]) => {
      const sig = real[name](...args);
      sink.push({ kind, read: () => get(sig) });
      return sig;
    };
  return {
    state: mk(exports.state as string, 'state'),
    derived: mk(exports.derived as string, 'derived'),
    get,
    set: real[exports.set as string] as (s: unknown, v: unknown) => unknown,
  };
}

// A compact, JSON-embeddable view of the static tree: signal COUNTS (not names) + child nesting.
export interface StaticTree {
  label: string;
  props: Record<string, unknown>;
  state: number;
  derived: number;
  /** field names per slot (sourcemap-recovered); entries may be null where unresolved */
  stateNames?: (string | null)[];
  derivedNames?: (string | null)[];
  children: StaticTree[];
}

export function toStaticTree(node: TreeNode): StaticTree {
  return {
    label: node.label,
    props: node.props,
    state: node.signals.state,
    derived: node.signals.derived,
    children: node.children.map(toStaticTree),
  };
}

// Build the static sub-tree for a node chunk (or null if it has no components). With a sourcemap,
// component labels become the real source names (`<Counter>`) and, via sourcesContent, the signal
// slots get their real field names (`count`/`doubled`) instead of the generic `state`/`derived`.
export function staticTreeForChunk(nodeChunk: string, sourcemap?: RawSourceMap): StaticTree | null {
  const { tree } = readProdNodeChunk(nodeChunk);
  if (!tree) return null;

  const compNames = sourcemap ? componentNamesFromSourcemap(nodeChunk, sourcemap) : null;
  const compFields = sourcemap ? componentFieldsFromSourcemap(nodeChunk, sourcemap) : null;

  const build = (t: TreeNode): StaticTree => {
    const real = compNames?.get(t.fn);
    const fields = compFields?.get(t.fn);
    const out: StaticTree = {
      label: real ? '<' + real + '>' : t.label,
      props: t.props,
      state: t.signals.state,
      derived: t.signals.derived,
      children: t.children.map(build),
    };
    // Names are matched to signals by position, so a count that differs means they are not theirs.
    if (fields?.state.length && fields.state.length === t.signals.state) {
      out.stateNames = fields.state;
    }
    if (fields?.derived.length && fields.derived.length === t.signals.derived) {
      out.derivedNames = fields.derived;
    }
    return out;
  };
  return build(tree);
}

// The wrapper module a browser interceptor serves in place of the runtime chunk import: re-exports
// the real chunk and overrides state/derived to record (recording logic embedded via toString —
// single source with wrapRuntime), and registers this chunk's static sub-tree. The runtime's export
// names are mangled to a letter or two and can be anything, so they are only ever export aliases,
// never bindings that could clash with the wrapper's own.
export function generateChunkWrapper(
  chunkUrl: string,
  exports: HookTargets['exports'],
  staticTreeJSON: string,
): string {
  const u = JSON.stringify(chunkUrl);
  return `import * as __rs_real from ${u};
export * from ${u};
const __rs_sink = [];
const __rs_wrap = ${wrapRuntime.toString()};
const __rs_hooked = __rs_wrap(__rs_real, ${JSON.stringify(exports)}, __rs_sink);
(globalThis.__RS_PROD_TREES__ ??= []).push({ tree: ${staticTreeJSON}, sink: __rs_sink });
const __rs_state = __rs_hooked.state;
const __rs_derived = __rs_hooked.derived;
export { __rs_state as ${exports.state} };
export { __rs_derived as ${exports.derived} };
`;
}
