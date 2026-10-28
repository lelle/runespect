import type { SerializedNode } from '@runespect/agent/protocol/internal';
import type { StaticTree, RecordedSignal } from './runtime-hook.js';

export interface ProdTreeEntry {
  tree: StaticTree;
  sink: RecordedSignal[];
}

// Merge the static sub-trees (structure + signal slots, anonymous names) with their recorded live
// signals into the SerializedNode[] the overlay/panel already consume. A pre-order walk consumes a
// component's signals in creation order (its own state/derived fire before its children mount).
// Heuristic — fragile under conditionals/loops — but exact for straight-line render. Must stay
// self-contained (no module-scope refs): it is serialized into the boot module via toString().
export function assembleSerialized(entries: ProdTreeEntry[]): SerializedNode[] {
  const nodes: SerializedNode[] = [];
  let seq = 0;

  // Signals are only ever recorded, never dropped, so a component mounted again adds a set behind
  // the old one. The newest sets are the instances on the page now.
  const signalsIn = (t: StaticTree): number =>
    t.state + t.derived + t.children.reduce((n, c) => n + signalsIn(c), 0);

  for (const entry of entries) {
    const queue = entry.sink.slice(-signalsIn(entry.tree) || entry.sink.length);
    const take = (kind: 'state' | 'derived', n: number): unknown[] => {
      const out: unknown[] = [];
      for (let i = 0; i < n; i++) {
        const idx = queue.findIndex((r) => r.kind === kind);
        if (idx === -1) break;
        out.push(queue.splice(idx, 1)[0].read());
      }
      return out;
    };

    const visit = (t: StaticTree, parent: number | null): SerializedNode => {
      const id = ++seq;
      const values: Record<string, unknown> = {};
      const writable: string[] = [];

      const states = take('state', t.state);
      const deriveds = take('derived', t.derived);
      states.forEach((v, i) => {
        const named = t.stateNames && t.stateNames[i];
        const k = named || (t.state > 1 ? 'state[' + i + ']' : 'state');
        values[k] = v;
        writable.push(k);
      });
      deriveds.forEach((v, i) => {
        const named = t.derivedNames && t.derivedNames[i];
        values[named || (t.derived > 1 ? 'derived[' + i + ']' : 'derived')] = v;
      });
      for (const p of Object.keys(t.props || {}))
        values['prop:' + p] = (t.props as Record<string, unknown>)[p];

      const node: SerializedNode = {
        id,
        name: t.label,
        parent,
        children: [],
        snippets: [],
        values,
        writable,
      };
      nodes.push(node);
      for (const c of t.children) node.children.push(visit(c, id).id);
      return node;
    };

    visit(entry.tree, null);
  }

  return nodes;
}
