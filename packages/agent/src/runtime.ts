// What the code @runespect/vite-plugin injects into an app's files calls, and nothing else of the
// agent: one call per component, one per .svelte.ts module, and one to start the page. The plugin
// describes what a file has; the agent does the rest (the parent link, teardown, HMR, the server).
// Released in lockstep with the plugin, so the descriptor needs no versioning.

import { getContext, onDestroy, setContext } from 'svelte';
import type { SymbolKind } from './protocol/internal';
import {
  bind,
  broadcast,
  connect,
  createHotTransport,
  enter,
  enterModule,
  leave,
  reportFrom,
  setOpenInEditor,
  watchStore,
  type HotChannel,
  type Subscribable,
} from './internal.svelte';

export interface SymbolSpec {
  kind: SymbolKind;
  /** Kept, and called only once a panel has opened. */
  read?: () => unknown;
  /** Only for what a panel may edit. */
  write?: (value: unknown) => void;
  /** A store read through its own subscription, in a component without runes or legacy syntax. */
  store?: Subscribable;
}

export interface ComponentDescriptor {
  name: string;
  loc?: string;
  snippets?: string[];
  symbols: Record<string, SymbolSpec>;
}

export interface ModuleDescriptor {
  file: string;
  symbols: Record<string, SymbolSpec>;
}

// A component finds its parent's node through Svelte's context, as an app's own context flows.
const PARENT = Symbol.for('runespect');

// Whatever goes wrong in here stays in runespect: the app's component starts anyway. Said once.
let warned = false;
function failOpen(what: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    if (warned) return;
    warned = true;
    console.warn(`[runespect] could not follow ${what}; the app runs on without it.`, error);
  }
}

const kindsOf = (symbols: Record<string, SymbolSpec>): Record<string, SymbolKind> | undefined => {
  const entries = Object.entries(symbols).map(([symbol, spec]) => [symbol, spec.kind]);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

function register(
  id: number,
  symbols: Record<string, SymbolSpec>,
  cleanUp?: (stop: () => void) => void,
) {
  for (const [symbol, spec] of Object.entries(symbols)) {
    if (spec.store) cleanUp?.(watchStore(id, symbol, spec.store));
    else if (spec.read) reportFrom(id, symbol, spec.read);
    if (spec.write) bind(id, symbol, spec.write);
  }
}

/** Called while a component starts. Registers it under its parent and leaves when it is destroyed. */
export function component(descriptor: ComponentDescriptor): void {
  failOpen(descriptor.name, () => {
    const { name, loc, snippets, symbols } = descriptor;
    const kinds = kindsOf(symbols);
    const id = enter(name, getContext<number | undefined>(PARENT), {
      ...(loc ? { loc } : {}),
      ...(snippets ? { snippets } : {}),
      ...(kinds ? { kinds } : {}),
    });
    setContext(PARENT, id);
    // onDestroy, not $effect: it puts no component into runes mode. The node leaves last, after its
    // stores let go, and even when registering failed halfway.
    try {
      register(id, symbols, (stop) => onDestroy(stop));
    } finally {
      onDestroy(() => leave(id));
    }
  });
}

/** Called when a .svelte.ts module runs. A module that runs again (HMR) replaces its node. */
export function module(
  descriptor: ModuleDescriptor,
  hot?: { dispose(cb: () => void): void },
): void {
  failOpen(descriptor.file, () => {
    const kinds = kindsOf(descriptor.symbols);
    const id = enterModule(descriptor.file, kinds ? { kinds } : {});
    register(id, descriptor.symbols);
    hot?.dispose(() => leave(id));
  });
}

/**
 * Called once per page: report to the browser extension, and over the dev server to the panel
 * window. Returns what stops both, for a test.
 */
export function start(options: { hot?: HotChannel; openInEditor?: boolean } = {}): () => void {
  const stops: (() => void)[] = [];
  failOpen('the page', () => {
    // Before anything connects: the first hello already says so.
    if (options.openInEditor === false) setOpenInEditor(false);
    stops.push(broadcast());
    if (options.hot) stops.push(connect(createHotTransport(options.hot)));
  });
  return () => stops.forEach((stop) => stop());
}
