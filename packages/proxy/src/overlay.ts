import type { SerializedNode } from '@runespect/agent/protocol/internal';

export interface OverlayHandle {
  update(): void;
  destroy(): void;
}

// A self-contained, plain-DOM tree overlay for a capture, for when the DevTools panel is not
// available: the tree is surfaced as a floating in-page panel. It polls window.__runespectReconstruct() (via
// getNodes) for the live SerializedNode[] and mirrors <Tree>'s data-* attributes in plain DOM.
//
// Plain DOM, no Svelte: this is injected into the page's MAIN world by serializing it with
// Function.prototype.toString() (see proxy served.ts overlayModule). It must therefore stay fully
// self-contained — reference only its arguments, nested helpers, and DOM globals (no imports, no
// module-scope references), or the serialized copy breaks.
//
// Read-only: reconstruct() yields serialized values, not the signal references an edit would need.
export function mountCaptureOverlay(
  doc: Document,
  getNodes: () => SerializedNode[],
): OverlayHandle {
  const panel = doc.createElement('aside');
  panel.setAttribute('data-testid', 'runespect-capture-overlay');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;max-height:90vh;overflow:auto;' +
    'font:12px/1.5 ui-monospace,monospace;color:#e0e0e0;background:#1e1e1e;border:1px solid #444;' +
    'padding:8px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.5)';

  const header = doc.createElement('div');
  header.style.cssText =
    'display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:4px';
  const title = doc.createElement('span');
  title.textContent = 'runespect — capture (experimental)';
  title.style.cssText = 'color:#4fc1ff;font-weight:bold';
  const copyBtn = doc.createElement('button');
  copyBtn.setAttribute('data-action', 'copy');
  copyBtn.textContent = 'copy';
  copyBtn.style.cssText =
    'font:inherit;cursor:pointer;background:#2d2d2d;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:0 6px';
  header.append(title, copyBtn);
  panel.appendChild(header);

  const body = doc.createElement('div');
  panel.appendChild(body);
  doc.body.appendChild(panel);

  const display = (v: unknown): string => {
    if (typeof v === 'function') return v.name ? `ƒ ${v.name}` : 'ƒ';
    if (v !== null && typeof v === 'object') {
      const marker = v as { __runespect?: unknown; name?: string };
      if (marker.__runespect === 'function') return marker.name ? `ƒ ${marker.name}` : 'ƒ';
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  // Cleaned display rows: prod props arrive as `prop:name` keys with a `<dynamic>` value when the
  // prop isn't a literal — strip the prefix and show just the name in that case.
  const valueRows = (
    node: SerializedNode,
  ): { name: string; value: string | null; isProp: boolean }[] =>
    Object.keys(node.values).map((key) => {
      const isProp = key.startsWith('prop:');
      const raw = node.values[key];
      return {
        name: isProp ? key.slice(5) : key,
        value: isProp && raw === '<dynamic>' ? null : display(raw),
        isProp,
      };
    });

  // Serialize the live tree as an indented text outline (component name + values per line).
  const formatStructure = (): string => {
    const nodes = getNodes() ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots = nodes.filter((n) => n.parent == null || !byId.has(n.parent));
    const lines: string[] = [];
    const walk = (node: SerializedNode, depth: number): void => {
      const vals = valueRows(node).map((r) => (r.value == null ? r.name : r.name + ': ' + r.value));
      lines.push('  '.repeat(depth) + node.name + (vals.length ? '  ' + vals.join(', ') : ''));
      for (const childId of node.children) {
        const child = byId.get(childId);
        if (child) walk(child, depth + 1);
      }
    };
    for (const root of roots) walk(root, 0);
    return lines.join('\n');
  };

  copyBtn.onclick = (): void => {
    const text = formatStructure();
    const done = (): void => {
      copyBtn.textContent = 'copied';
      setTimeout(() => (copyBtn.textContent = 'copy'), 1000);
    };
    const nav = doc.defaultView?.navigator as {
      clipboard?: { writeText?: (t: string) => Promise<void> };
    };
    const p = nav?.clipboard?.writeText?.(text);
    if (p && typeof p.then === 'function') p.then(done, () => {});
    else done();
  };

  const renderNode = (node: SerializedNode, byId: Map<number, SerializedNode>): HTMLElement => {
    const li = doc.createElement('div');
    li.setAttribute('data-component', node.name);
    li.style.cssText = 'padding-left:12px';

    const name = doc.createElement('span');
    name.textContent = node.name;
    name.style.cssText = 'color:#4fc1ff;font-weight:bold';
    li.appendChild(name);

    for (const { name: sym, value, isProp } of valueRows(node)) {
      const row = doc.createElement('div');
      row.setAttribute('data-symbol', sym);
      if (isProp) row.setAttribute('data-prop', '');
      row.style.cssText = 'padding-left:12px';

      const key = doc.createElement('span');
      key.textContent = value == null ? sym : sym + ': ';
      key.style.cssText = isProp ? 'color:#888' : 'color:#c586c0';
      row.appendChild(key);

      if (value != null) {
        const val = doc.createElement('span');
        val.setAttribute('data-value', node.name + '.' + sym);
        val.textContent = value;
        val.style.cssText = 'color:#b5cea8';
        row.appendChild(val);
      }
      li.appendChild(row);
    }

    for (const childId of node.children) {
      const child = byId.get(childId);
      if (child) li.appendChild(renderNode(child, byId));
    }
    return li;
  };

  const update = (): void => {
    const nodes = getNodes() ?? [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots = nodes.filter((n) => n.parent == null || !byId.has(n.parent));
    body.textContent = '';

    if (!roots.length) {
      const empty = doc.createElement('div');
      empty.setAttribute('data-empty', '');
      empty.textContent = 'no Svelte components captured yet';
      empty.style.cssText = 'color:#888';
      body.appendChild(empty);
      return;
    }
    for (const root of roots) body.appendChild(renderNode(root, byId));
  };

  update();
  return {
    update,
    destroy(): void {
      panel.remove();
    },
  };
}
