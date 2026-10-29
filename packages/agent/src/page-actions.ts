import { boundsOf, elementsForNode, nodeIdForElement } from './dom';
import { allInOrder, find, onServer, read, readLive } from './tree.svelte';
import { snap } from './snap.svelte';

// The DevTools panel can't touch the page DOM/context, so it sends action messages and the
// agent performs them here. These also work standalone on any plugin page (no overlay needed).

let highlightBox: HTMLElement | null = null;
// The component's name, on the box's top edge, or just inside it at the top of the viewport.
let highlightLabel: HTMLElement | null = null;
// What the box is currently drawn over, and the listeners keeping it there. The box is
// position:fixed with viewport coordinates, so every scroll — of the window or of any container
// between the element and the root — moves the element out from under it.
let highlightTargets: Element[] = [];
let stopTracking: (() => void) | null = null;

function trackBox(elements: Element[], name: string): void {
  highlightTargets = elements;
  showBox(boundsOf(elements)!);
  highlightLabel!.textContent = name;
  if (stopTracking) return; // already listening; the target just changed
  const reposition = (): void => {
    const bounds = boundsOf(highlightTargets);
    if (bounds) showBox(bounds);
  };
  // Capture, because a scroll inside a container does not bubble to the window.
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
  stopTracking = () => {
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    stopTracking = null;
  };
}

function showBox(rect: DOMRect): void {
  // isConnected, not just null: an app that replaces document.body (or a test that resets it)
  // leaves the old box detached, and reusing it would highlight into nothing.
  if (!highlightBox?.isConnected) {
    highlightBox = document.createElement('div');
    highlightBox.setAttribute('data-runespect-highlight', '');
    Object.assign(highlightBox.style, {
      position: 'fixed',
      pointerEvents: 'none',
      background: 'rgba(194, 65, 12, 0.2)',
      outline: '2px solid #c2410c',
      zIndex: '2147483646',
    });
    highlightLabel = highlightBox.appendChild(document.createElement('span'));
    Object.assign(highlightLabel.style, {
      position: 'absolute',
      left: '-2px',
      padding: '1px 4px',
      background: '#c2410c',
      color: '#fff',
      font: '11px/14px system-ui, sans-serif',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(highlightBox);
  }
  highlightLabel!.style.top = rect.top < 16 ? '0' : '-16px';
  Object.assign(highlightBox.style, {
    display: 'block',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}
function hideBox(): void {
  if (highlightBox) highlightBox.style.display = 'none';
  highlightTargets = [];
  stopTracking?.();
}

// Highlight a node's element in the page (panel hover). null clears it.
export function highlight(id: number | null): void {
  if (onServer()) return;
  if (id == null) return hideBox();
  boxNode(find(id));
}

// The box over every element of `node`'s instance, named; off when it has none in the page.
function boxNode(node: ReturnType<typeof find>): void {
  const elements = node ? elementsForNode(node, allInOrder()) : [];
  if (node && elements.length) trackBox(elements, node.name);
  else hideBox();
}

let pickStop: (() => void) | null = null;
// Enter element-pick mode: hovering the page highlights the nearest component, click selects it
// (reports its node id via onPicked), ESC cancels.
export function startPick(onPicked: (id: number | null) => void): void {
  if (onServer()) return;
  stopPick();
  // The box shows what a click here would pick: the instance, not the element under the pointer.
  const onMove = (e: MouseEvent): void => {
    const id = nodeIdForElement(e.target as Element, allInOrder());
    boxNode(id == null ? undefined : find(id));
  };
  const onClick = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onPicked(nodeIdForElement(e.target as Element, allInOrder()));
    stopPick();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      onPicked(null);
      stopPick();
    }
  };
  // A press would open a menu or start a drag in the app before the click picks the element.
  const swallow = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
  };
  const PRESSES = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  for (const type of PRESSES) document.addEventListener(type, swallow, true);
  pickStop = () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    for (const type of PRESSES) document.removeEventListener(type, swallow, true);
    hideBox();
    pickStop = null;
  };
}
export function stopPick(): void {
  pickStop?.();
}

// Log a node's data to the page console.
export function logNode(id: number): void {
  if (onServer()) return;
  const n = find(id);
  if (!n) return;
  const values = Object.fromEntries(Object.entries(n.values).map(([k, v]) => [k, snap(v)]));
  console.log(`%c[runespect] <${n.name}>`, 'color:#c2410c', { id: n.id, values });
}

// Store a value on window.$r (devtools "store as global").
export function storeGlobal(id: number, symbol: string): void {
  if (onServer()) return;
  // The app's own value, as React DevTools' $r: a call on it changes the app.
  let value: unknown;
  try {
    value = readLive(id, symbol) ?? read(id, symbol);
  } catch {
    value = read(id, symbol);
  }
  (window as unknown as { $r: unknown }).$r = value;
  console.log('[runespect] window.$r =', value);
}

export function resetPageActions(): void {
  stopPick();
  hideBox();
}
