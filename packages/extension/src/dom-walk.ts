import { componentName, type SerializedNode } from '@runespect/agent/protocol/internal';

// Tier-1 fallback: zero-setup inspection of any dev-mode Svelte tab from the rendered DOM, with no
// instrumentation — so it coexists with the user's DevTools. Svelte attaches
// `__svelte_meta.loc` ({ file, line }) to elements in dev builds. We read which component each
// element belongs to and derive a component tree from DOM containment: a component's child
// components are the distinct components found inside its elements. NOTE: this is approximate — DOM
// nesting ≈ component nesting, a component is deduped by source file (multiple instances collapse to
// one node), and a shared/recursive component is expanded (duplicated) per parent. It yields the
// tree + source locations, NOT reactive state (that needs the plugin). `__svelte_meta` is a
// MAIN-world property, so the reader must run in the page's main world, not an isolated content
// script.

interface SvelteMeta {
  loc?: { file?: string; line?: number; column?: number };
}

const metaFile = (el: Element): string | undefined =>
  (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta?.loc?.file;
const metaLine = (el: Element): number | undefined =>
  (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta?.loc?.line;

export function componentsFromSvelteMeta(root: Element): SerializedNode[] {
  // file -> { line, children: set of component files contained directly within it }
  const info = new Map<string, { line: number; children: Set<string> }>();
  const rec = (f: string) => {
    let i = info.get(f);
    if (!i) info.set(f, (i = { line: 0, children: new Set() }));
    return i;
  };

  const nearestAncestorFile = (el: Element): string | undefined => {
    let p = el.parentElement;
    while (p) {
      const f = metaFile(p);
      if (f) return f;
      p = p.parentElement;
    }
    return undefined;
  };

  for (const el of Array.from(root.querySelectorAll('*'))) {
    const f = metaFile(el);
    if (!f) continue;
    const r = rec(f);
    if (!r.line) r.line = metaLine(el) ?? 0;
    const parentFile = nearestAncestorFile(el);
    if (parentFile && parentFile !== f) rec(parentFile).children.add(f);
  }

  const childFiles = new Set([...info.values()].flatMap((i) => [...i.children]));
  const roots = [...info.keys()].filter((f) => !childFiles.has(f));

  const nodes: SerializedNode[] = [];
  let seq = 0;
  const visit = (file: string, parent: number | null, path: Set<string>): number => {
    const id = ++seq;
    const r = info.get(file)!;
    const node: SerializedNode = {
      id,
      name: componentName(file),
      parent,
      children: [],
      values: {},
      snippets: [],
      writable: [],
      loc: `${file}:${r.line}`,
    };
    nodes.push(node);
    if (!path.has(file)) {
      const next = new Set(path).add(file);
      for (const childFile of r.children) node.children.push(visit(childFile, id, next));
    }
    return id;
  };
  for (const f of roots) visit(f, null, new Set());
  return nodes;
}
