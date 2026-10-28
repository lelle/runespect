import { afterAll } from 'vitest';
import { mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mount, unmount, flushSync, type Component } from 'svelte';
import * as agent from '@runespect/agent/internal';
import type { InspectNode } from '@runespect/agent/internal';
import type { SymbolKind } from '@runespect/agent/protocol/internal';

// Tests of the instrumentation give a component or module as a string and look at what the agent
// ends up holding, not at the code runespect wrote. The source is written under src/, where the
// playground's own pipeline compiles it as an app's would (Vite, vite-plugin-svelte, vitePreprocess,
// runespectPreprocess). One directory per Vitest worker, and each file appears whole: written aside,
// then renamed, so Vite never reads a partial file while several workers write.

const SRC = path.join(import.meta.dirname, '../../src');
const WORKER = process.env.VITEST_POOL_ID ?? '0';
const DIRS = [path.join(SRC, '.fixtures', WORKER), path.join(SRC, 'modules/.fixtures', WORKER)];
afterAll(() => {
  for (const dir of DIRS) {
    rmSync(dir, { recursive: true, force: true });
    try {
      rmdirSync(path.dirname(dir)); // only once no other worker still has files there
    } catch {
      /* not empty yet, or already gone */
    }
  }
});

export interface Registered {
  node: InspectNode;
  kinds: Record<string, SymbolKind>;
  /** Every symbol the agent reports, once a panel has opened. */
  readable: string[];
  /** The symbols a panel may edit. */
  writable: string[];
  stores: string[];
  values: Record<string, unknown>;
  children: Registered[];
  /** Edit a value as the panel does, then let the app react. */
  set(symbol: string, value: unknown): boolean;
}

function registered(node: InspectNode): Registered {
  const current = (): InspectNode => agent.getNode(node.id) ?? node;
  return {
    node,
    kinds: node.kinds ?? {},
    get readable() {
      return Object.keys(current().values);
    },
    get writable() {
      return Object.keys(current().values).filter((k) => agent.isWritable(node.id, k));
    },
    stores: Object.entries(node.kinds ?? {})
      .filter(([, kind]) => kind === 'store')
      .map(([symbol]) => symbol),
    get values() {
      return Object.fromEntries(
        Object.keys(current().values).map((k) => [k, agent.read(node.id, k)]),
      );
    },
    get children() {
      return current().children.map((id) => registered(agent.getNode(id)!));
    },
    set(symbol, value) {
      const ok = agent.setValue(node.id, symbol, value, []);
      flushSync();
      return ok;
    },
  };
}

function place(dir: string, filename: string, source: string): string {
  const hashed = path.join(dir, createHash('sha1').update(source).digest('hex').slice(0, 10));
  mkdirSync(hashed, { recursive: true });
  const file = path.join(hashed, filename);
  writeFileSync(`${file}.tmp`, source);
  renameSync(`${file}.tmp`, file);
  return file;
}

function begin(activate: boolean): void {
  agent.reset();
  if (activate) agent.activate();
}

/** Mount a component given as source, and return the node the agent made for it. */
export async function instrumented(
  source: string,
  options: {
    filename?: string;
    props?: Record<string, unknown>;
    context?: Map<unknown, unknown>;
    /** Open a panel first (default). Off, to see what the page does before one opens. */
    activate?: boolean;
  } = {},
): Promise<Registered & { unmount(): void }> {
  const { filename = 'Fixture.svelte', props = {}, context, activate = true } = options;
  begin(activate);
  const file = place(DIRS[0], filename, source);
  const { default: component } = (await import(/* @vite-ignore */ file)) as {
    default: Component<Record<string, unknown>>;
  };
  const target = document.body.appendChild(document.createElement('div'));
  const app = mount(component, { target, props, ...(context ? { context } : {}) });
  flushSync();
  const node = agent.allNodes().find((n) => n.parent === null);
  if (!node) throw new Error(`runespect registered nothing for ${filename}:\n${source}`);
  // Assigned, not spread: spreading would read the getters once and freeze the values.
  return Object.assign(registered(node), {
    unmount: () => {
      unmount(app);
      flushSync();
    },
  });
}

/** Import a .svelte.ts module given as source, and return the node the agent made for it. */
export async function instrumentedModule(
  source: string,
  options: { filename?: string; activate?: boolean } = {},
): Promise<Registered & { exports: Record<string, unknown> }> {
  const { filename = 'state.svelte.ts', activate = true } = options;
  begin(activate);
  const file = place(DIRS[1], filename, source);
  const exports = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
  flushSync();
  const node = agent.allNodes().find((n) => n.loc === file);
  if (!node) throw new Error(`runespect registered nothing for ${filename}:\n${source}`);
  return Object.assign(registered(node), { exports });
}
