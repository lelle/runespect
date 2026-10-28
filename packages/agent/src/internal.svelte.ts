// @runespect/agent/internal: the agent's runtime, for the injected code, the plugin, the panels and
// the tests. One agent per page, in parts that each own their state and import only the parts
// listed above them:
//   tree.svelte.ts       the nodes, their readers, store watches and edits
//   history.ts           the commits, bounded
//   wire.svelte.ts       serialization, lazy inspection and the flush watcher
//   observe.ts           the event log of every hop
//   page-actions.ts      highlight, pick, and the console actions
//   surface.ts           window.__runespect
//   transport.svelte.ts  connect(), broadcast() and the window and dev-server channels
import { resetTree } from './tree.svelte';
import { resetHistory } from './history';
import { resetWire } from './wire.svelte';
import { resetObserve } from './observe';
import { resetPageActions } from './page-actions';
import { resetTransport } from './transport.svelte';

export { componentElement, nodeIdForElement, elementForNode } from './dom';
export { snap } from './snap.svelte';
export {
  enter,
  enterModule,
  leave,
  report,
  reportFrom,
  watchStore,
  bind,
  setValue,
  read,
  isWritable,
  getNode,
  allNodes,
  roots,
} from './tree.svelte';
export type { InspectNode, Subscribable } from './tree.svelte';
export type { ComponentSummary, RunespectSurface } from './surface';
export { commits } from './history';
export { activate, serialize, inspectPath } from './wire.svelte';
export { highlight, startPick, logNode, storeGlobal } from './page-actions';

export {
  connect,
  broadcast,
  createWindowTransport,
  createHotTransport,
  HOT_EVENT,
  setOpenInEditor,
  openInEditor,
} from './transport.svelte';
export type { HotChannel } from './transport.svelte';

// A reset agent is the agent of a page that has just loaded: what each part started is stopped, in
// the reverse order the parts build on each other, and each part's data is replaced.
export function reset(): void {
  resetTransport();
  resetObserve();
  resetPageActions();
  resetHistory();
  resetWire();
  resetTree();
}
