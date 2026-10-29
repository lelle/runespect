// Page-side DOM helpers shared by the in-app overlay and the panel→page bridge. Svelte's dev
// build tags each component's elements with __svelte_meta.loc; we map between DOM elements and
// nodes by file. __svelte_meta has the path relative to the project and the preprocessor the
// absolute one, so a node belongs to an element when its path ends with the element's at a folder
// boundary. Basenames alone are not enough: every SvelteKit layout is +layout.svelte. Dev-only,
// like React DevTools' picker.
//
// A component's source file identifies its TYPE, not a single instance — every <Counter> shares
// Counter.svelte. So a file match alone collapses all instances onto the first. We
// disambiguate by POSITION: the k-th node of a given type (registration order, i.e. by id) maps
// to the k-th instance root in DOM order. An "instance root" is the topmost tagged element of an
// instance's subtree (a same-file element with no same-file tagged ancestor) — one per instance.

interface SvelteMeta {
  loc?: { file?: string };
}

interface LocNode {
  id: number;
  loc?: string;
}

// A component outside the Vite root is tagged `../shared/Card.svelte`; the part below the parent
// folder is still a suffix of its absolute path.
const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/^(\.\.?\/)+/, '');

function locMatches(loc: string, file: string): boolean {
  const abs = normalize(loc);
  const rel = normalize(file);
  return abs === rel || abs.endsWith(`/${rel}`);
}

// The nodes of the component in `file`. When two folders both end with that path, the closest one is
// meant: the project root is the same prefix for every component.
function nodesOfFile(file: string, nodes: ReadonlyArray<LocNode>): LocNode[] {
  const matching = nodes.filter((n) => n.loc && locMatches(n.loc, file));
  if (!matching.length) return [];
  const closest = matching.reduce((a, b) => (b.loc!.length < a.loc!.length ? b : a)).loc;
  return matching.filter((n) => n.loc === closest).sort((a, b) => a.id - b.id);
}

function metaFile(el: Element): string | undefined {
  return (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta?.loc?.file;
}

// Nearest ancestor-or-self carrying Svelte dev component metadata.
export function componentElement(el: Element | null): Element | null {
  let cur: Element | null = el;
  while (cur) {
    if (metaFile(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function hasSameFileAncestor(el: Element, file: string): boolean {
  let cur = el.parentElement;
  while (cur) {
    if (metaFile(cur) === file) return true;
    cur = cur.parentElement;
  }
  return false;
}

// The topmost ancestor-or-self of `el` tagged with `file` — the root element of the instance
// `el` belongs to. null if `el` isn't inside a `file` component.
function instanceRootOf(el: Element, file: string): Element | null {
  let cur: Element | null = el;
  let root: Element | null = null;
  while (cur) {
    if (metaFile(cur) === file) root = cur;
    cur = cur.parentElement;
  }
  return root;
}

// One element per instance of the component in `file`, in DOM order.
function instanceRoots(file: string, root: ParentNode): Element[] {
  const out: Element[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (metaFile(el) === file && !hasSameFileAncestor(el, file)) out.push(el);
  }
  return out;
}

// The __svelte_meta file the elements of `node`'s component carry, if any is rendered under `root`.
function fileOfNode(
  node: LocNode,
  nodes: ReadonlyArray<LocNode>,
  root: ParentNode,
): string | undefined {
  for (const el of root.querySelectorAll('*')) {
    const file = metaFile(el);
    if (file && locMatches(node.loc!, file) && nodesOfFile(file, nodes).includes(node)) return file;
  }
  return undefined;
}

// The elements each instance renders at its top level, as the instrumentation reports them: an
// element knows its node, so neither the file nor the position has to be guessed. Once a page
// reports any, they decide; the guess above is for markup nothing reports.
let owner = new WeakMap<Element, number>();
let rendered = new Map<number, Set<Element>>();

/** Records that the instance of node `id` rendered `el`; the returned function forgets it. */
export function ownElement(id: number, el: Element): () => void {
  owner.set(el, id);
  const own = rendered.get(id) ?? new Set();
  rendered.set(id, own.add(el));
  return () => {
    if (owner.get(el) === id) owner.delete(el);
    own.delete(el);
    if (!own.size && rendered.get(id) === own) rendered.delete(id);
  };
}

export function resetElements(): void {
  owner = new WeakMap();
  rendered = new Map();
}

const reporting = (): boolean => rendered.size > 0;

const inDomOrder = (a: Element, b: Element): number =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

function reportedNodeOf(el: Element | null, nodes: ReadonlyArray<LocNode>): number | null {
  for (let cur = el; cur; cur = cur.parentElement) {
    const id = owner.get(cur);
    if (id !== undefined) return nodes.some((n) => n.id === id) ? id : null;
  }
  return null;
}

function reportedElementsOf(node: LocNode, root: ParentNode): Element[] {
  return [...(rendered.get(node.id) ?? [])].filter((el) => root.contains(el)).sort(inDomOrder);
}

// A hovered DOM element → the id of the node it belongs to. Disambiguates repeated component
// types by the element's instance position (falls back to the first peer when position is
// unknown, e.g. the element isn't under `root`).
export function nodeIdForElement(
  el: Element | null,
  nodes: ReadonlyArray<LocNode>,
  root: ParentNode = document,
): number | null {
  if (reporting()) return reportedNodeOf(el, nodes);
  const comp = componentElement(el);
  const file = comp ? metaFile(comp) : undefined;
  if (!comp || !file) return null;
  const peers = nodesOfFile(file, nodes);
  if (!peers.length) return null;
  const instRoot = instanceRootOf(comp, file);
  const idx = instRoot ? instanceRoots(file, root).indexOf(instRoot) : -1;
  const chosen = idx >= 0 && idx < peers.length ? peers[idx] : peers[0];
  return chosen.id;
}

// Reverse: a node → the DOM element of its instance (instance-aware). Returns the instance root
// element so callers can take its bounding rect to draw a highlight.
export function elementForNode(
  node: LocNode | null | undefined,
  nodes: ReadonlyArray<LocNode>,
  root: ParentNode = document,
): Element | null {
  if (node && reporting()) return reportedElementsOf(node, root)[0] ?? null;
  if (!node?.loc) return null;
  const file = fileOfNode(node, nodes, root);
  if (!file) return null;
  const roots = instanceRoots(file, root);
  const idx = nodesOfFile(file, nodes).indexOf(node);
  return (idx >= 0 ? roots[idx] : undefined) ?? roots[0] ?? null;
}

/** Every element a node's instance renders at its top level, in DOM order. */
export function elementsForNode(
  node: LocNode | null | undefined,
  nodes: ReadonlyArray<LocNode>,
  root: ParentNode = document,
): Element[] {
  if (node && reporting()) return reportedElementsOf(node, root);
  const el = elementForNode(node, nodes, root);
  return el ? [el] : [];
}

/** The smallest rectangle around `elements`, in viewport coordinates; null for none. */
export function boundsOf(elements: ReadonlyArray<Element>): DOMRect | null {
  const rects = elements.map((el) => el.getBoundingClientRect());
  if (rects.length < 2) return rects[0] ?? null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return new DOMRect(left, top, right - left, bottom - top);
}
