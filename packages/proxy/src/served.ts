import { dehydrate, PROTOCOL_VERSION, TIER0_FLAG } from '@runespect/agent/protocol/internal';
import { mountCaptureOverlay } from './overlay.js';

// Self-contained module sources a capture host serves to the page. They must NOT use
// bare specifiers (the page cannot resolve them), so the recording wrapper and the reconstruction
// are inlined here.

// The recording behind the dev wrapper: overrides of the internals a compiled component calls, each
// delegating to the real one. Self-contained (it references only its arguments) because it is
// embedded in the wrapper via toString(), which is also what lets tests run it against the real
// internals.
export function recordingRuntime(real: any, g: any): Record<string, (...a: any[]) => unknown> {
  // Svelte's private runtime can change on any release. Without what the recording relies on,
  // the page gets the real runtime untouched and the panel is told why there is nothing.
  const overridden = [
    'push',
    'pop',
    'state',
    'mutable_source',
    'derived',
    'derived_safe_equal',
    'tag_proxy',
  ];
  const missing = [...overridden, 'render_effect', 'snapshot'].filter(
    (k) => typeof real[k] !== 'function',
  );
  if (missing.length) {
    (g.__RS_CAPTURE__ ??= {}).problem =
      `Svelte internals not recognised (missing ${missing.join(', ')}), so nothing is captured.`;
    return Object.fromEntries(overridden.map((k) => [k, real[k]]));
  }
  const log = () => (g.__RS_COLLECTOR__ ??= { roots: [], stack: [] });
  const top = () => log().stack[log().stack.length - 1];
  // [FILENAME] survives HMR's "wrapper" rename.
  const nameOf = (fn: any): string => {
    const file = fn && real.FILENAME ? fn[real.FILENAME] : undefined;
    if (typeof file === 'string') {
      const base = file
        .split('/')
        .pop()!
        .replace(/\.svelte$/, '');
      if (base) return base;
    }
    return fn && fn.name && fn.name !== 'wrapper' ? fn.name : 'Component';
  };
  const rec = (signal: unknown, kind: string): void => {
    const t = top();
    if (t) t.signals.push({ signal, kind });
  };
  return {
    push(...a: any[]) {
      const r = real.push(...a);
      const fn = a.find((x) => typeof x === 'function') ?? null;
      const parent = top() ?? null;
      const frame = { fn, name: nameOf(fn), children: [], signals: [] };
      const siblings = parent ? parent.children : log().roots;
      siblings.push(frame);
      const stack = log().stack;
      stack.push(frame);
      // A component that throws while it initialises never reaches pop(). Initialising is
      // synchronous, so whatever is still on the stack a microtask later is left over from one.
      if (!log().clearing) {
        log().clearing = true;
        queueMicrotask(() => {
          stack.length = 0;
          log().clearing = false;
        });
      }
      // Created under the component's own branch, so its teardown runs when the component is
      // unmounted (navigation, {#if}, {#each}, HMR, a boundary catching its error); the frame then
      // leaves the tree, and the stack if it never got to pop().
      real.render_effect(() => () => {
        const i = siblings.indexOf(frame);
        if (i !== -1) siblings.splice(i, 1);
        const j = stack.indexOf(frame);
        if (j !== -1) stack.length = j;
      });
      return r;
    },
    pop(...a: any[]) {
      log().stack.pop();
      return real.pop(...a);
    },
    state(v: unknown, ...r: any[]) {
      const s = real.state(v, ...r);
      rec(s, 'state');
      return s;
    },
    mutable_source(v: unknown, ...r: any[]) {
      const s = real.mutable_source(v, ...r);
      rec(s, 'state');
      return s;
    },
    derived(fn: unknown, ...r: any[]) {
      const d = real.derived(fn, ...r);
      rec(d, 'derived');
      return d;
    },
    derived_safe_equal(fn: unknown, ...r: any[]) {
      const d = real.derived_safe_equal(fn, ...r);
      rec(d, 'derived');
      return d;
    },
    // A $state object or array that is never reassigned is a proxy, not a signal; dev builds label
    // it through tag_proxy. Read as a snapshot, so the tree holds plain data.
    tag_proxy(value: unknown, label: string) {
      const r = real.tag_proxy(value, label);
      rec(
        {
          label,
          get v() {
            return real.snapshot(value);
          },
        },
        'proxy',
      );
      return r;
    },
  };
}

// The wrapper substituted for a component's svelte/internal/client import. Re-exports the real
// internals (imported from their original url) and overrides the ones the recording needs.
export function wrapperModule(originalUrl: string): string {
  const u = JSON.stringify(originalUrl);
  return `import * as real from ${u};
export * from ${u};
const __rs = (${recordingRuntime.toString()})(real, globalThis);
export const push = __rs.push;
export const pop = __rs.pop;
export const state = __rs.state;
export const mutable_source = __rs.mutable_source;
export const derived = __rs.derived;
export const derived_safe_equal = __rs.derived_safe_equal;
export const tag_proxy = __rs.tag_proxy;
`;
}

// The capture overlay module, injected into the page's MAIN world (where bootModule put
// __runespectReconstruct). Serializes the typed mountCaptureOverlay (single source of truth — no
// hand-maintained string twin) and polls reconstruct() once a second. Guarded so an injection that
// runs for every document mounts only one overlay.
export function overlayModule(): string {
  return `(() => {
  const g = globalThis;
  if (g.__rsOverlayMounted) return;
  g.__rsOverlayMounted = true;
  const mount = ${mountCaptureOverlay.toString()};
  const getNodes = () => (typeof g.__runespectReconstruct === 'function' ? g.__runespectReconstruct() : []);
  const start = () => {
    const handle = mount(document, getNodes);
    g.__rsOverlay = handle;
    g.__rsOverlayTimer = setInterval(() => handle.update(), 1000);
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
`;
}

// The panel bridge, injected into the page's MAIN world during capture. It broadcasts the captured
// tree in the plugin format (window.postMessage), so the content-script relay forwards it to the
// runespect DevTools panel. Because it is plain page code it keeps broadcasting after the host stops
// injecting, so the panel reads the instrumentation that capture left behind. Responds to the
// panel's `request` and polls for live updates. Read-only, like the overlay.
export function bridgeModule(): string {
  return `(() => {
  const g = globalThis;
  if (g.__rsBridge) return;
  g.__rsBridge = true;
  const snapshot = () => {
    const fn = g.__runespectReconstruct;
    if (typeof fn !== 'function') return null;
    try { return fn(); } catch (e) { return null; }
  };
  // The same encoder the agent uses: the relay to the extension carries JSON. Nobody answers an
  // inspect request here, so values go whole and a stub is final.
  const encode = ${dehydrate.toString()};
  const safe = (v) => {
    try { return encode(v, Infinity, { inspectable: false }); } catch (e) { return String(v); }
  };
  const clean = (nodes) => nodes.map((n) => {
    const values = {};
    for (const k in n.values) values[k] = safe(n.values[k]);
    // Read-only: the bridge does not take edits, so it offers none.
    return { id: n.id, name: n.name, parent: n.parent, children: n.children, values: values, snippets: n.snippets, writable: [], loc: n.loc };
  });
  const post = () => {
    const nodes = snapshot();
    // [] is truthy — only broadcast a non-empty tree, else a capture with no recorded data would
    // clobber another source's tree (e.g. names-only) in the panel with an empty one.
    if (!nodes || !nodes.length) return;
    // A dev-captured page still carries __svelte_meta, so Names only would post its stateless tree too
    // and the panel would flip between the two. Once there is a tree, the page is ours.
    g[${JSON.stringify(TIER0_FLAG)}] = true;
    window.postMessage({ source: 'runespect', kind: 'tree', nodes: clean(nodes) }, '*');
  };
  // Capture: the tree comes from a capture of Svelte's runtime, not the app's own plugin, and the
  // panel says which one it is talking to. Volunteered on start as well as on
  // request: a panel that was already open sent its one request before this page existed.
  const hello = () => {
    const problem = g.__RS_CAPTURE__ && g.__RS_CAPTURE__.problem;
    window.postMessage({ source: 'runespect', kind: 'hello', version: ${PROTOCOL_VERSION}, tier: 2, ...(problem ? { problem } : {}) }, '*');
  };
  window.addEventListener('message', (e) => {
    const m = e && e.data;
    if (!(m && m.source === 'runespect' && m.kind === 'request')) return;
    post();
    hello();
  });
  g.__rsBridgeTimer = setInterval(post, 1000);
  post();
  hello();
})();
`;
}

// The boot module injected into the page. Exposes window.__runespectReconstruct(): the same
// SerializedNode[] the agent produces, rebuilt from the recorded log. The host (panel/overlay)
// calls it after the app has mounted.
export function bootModule(): string {
  return `const g = globalThis;
function reconstruct() {
  const lg = g.__RS_COLLECTOR__ ?? { roots: [] };
  const nodes = [];
  let seq = 0;
  const visit = (frame, parent) => {
    const node = { id: ++seq, name: frame.name || (frame.fn && frame.fn.name) || 'Component', parent, children: [], values: {}, snippets: [], writable: [] };
    nodes.push(node);
    for (const { signal, kind } of frame.signals) {
      const name = signal && signal.label;
      if (name == null) continue;
      node.values[name] = signal.v;
      if (kind === 'state' && !node.writable.includes(name)) node.writable.push(name);
    }
    for (const child of frame.children) node.children.push(visit(child, node.id).id);
    return node;
  };
  for (const root of lg.roots) visit(root, null);
  return nodes;
}
g.__runespectReconstruct = reconstruct;
`;
}
