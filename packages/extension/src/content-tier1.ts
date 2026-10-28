import { TIER0_FLAG, treeMessage } from '@runespect/agent/protocol/internal';
import { componentsFromSvelteMeta } from './dom-walk.js';

// Tier-1 fallback content script: on any dev Svelte tab that does NOT use the runespect plugin,
// post the DOM-derived component list (names + source locations, no state) so the panel can still
// show something. The relay forwards these `tree` messages like any other. The walk runs every
// interval on every tab; the tree is posted only when it changed, or when a panel asks for it.
export function startTier1(win: Window = window, intervalMs = 1000): () => void {
  let last = '';
  const post = (force: boolean): void => {
    // Yield to Tier-0: if the page runs the runespect plugin's broadcaster, its rich tree (with
    // state) owns the panel. Broadcasting our stateless DOM-walk would make the panel collapse to
    // it. Checked every time so ordering between the plugin and this script doesn't matter.
    if ((win as unknown as Record<string, unknown>)[TIER0_FLAG]) return;
    const body = win.document.body; // null in an SVG or XML document
    if (!body) return;
    const nodes = componentsFromSvelteMeta(body);
    const signature = JSON.stringify(nodes);
    if (!nodes.length || (signature === last && !force)) return;
    last = signature;
    win.postMessage(treeMessage(nodes), '*');
  };
  // A panel that opens later asks with `request`; the tree it missed has not changed since.
  const onMessage = (e: MessageEvent): void => {
    const data = e.data as { source?: unknown; kind?: unknown } | null;
    if (e.source === win && data?.source === 'runespect' && data.kind === 'request') post(true);
  };
  win.addEventListener('message', onMessage);
  const id = win.setInterval(() => post(false), intervalMs);
  post(false);
  return () => {
    win.clearInterval(id);
    win.removeEventListener('message', onMessage);
  };
}
