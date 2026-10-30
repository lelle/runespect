import { SvelteMap } from 'svelte/reactivity';
import type { SerializedNode } from '@runespect/agent/protocol/internal';
import { changedKeys } from './flash';

const FLASH_MS = 700;

// Flash-on-update state machine, shared by <Tree> and <Detail>. Diff each node's values against
// the previous update(); changed `id:symbol` keys carry the flash for FLASH_MS, then clear so a
// later change re-triggers. A CSS animation only starts over when its name changes, so a change
// mid-blink turns the flash: flashAgain/nodeFlashAgain say which of two identical animations to
// run. `#flashing` and `#nodeTurns` are SvelteMaps, so reading them in a template re-renders when
// they change. `#prev`/`#timers` are deliberately plain Maps: they are bookkeeping the UI never
// reads, so making them reactive would only cost. One instance per component (call destroy() on
// unmount).
export class Flasher {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive bookkeeping
  #prev = new Map<number, Record<string, unknown>>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive bookkeeping
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #flashing = new SvelteMap<string, boolean>();
  #nodeTurns = new SvelteMap<number, boolean>();

  // Diff the given nodes against the last update and schedule flashes for changed values. Call
  // inside an untrack()'d $effect so writing #flashing doesn't re-trigger the effect.
  update(nodes: readonly SerializedNode[]): void {
    // A node that left is forgotten: ids grow with every remount, and one that comes back is new.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a local lookup, never rendered
    const present = new Set(nodes.map((n) => n.id));
    for (const id of this.#prev.keys()) if (!present.has(id)) this.#prev.delete(id);
    for (const n of nodes) {
      const changed = changedKeys(this.#prev.get(n.id), n.values);
      if (changed.length)
        this.#nodeTurns.set(n.id, this.nodeFlashing(n.id) && !this.nodeFlashAgain(n.id));
      for (const sym of changed) {
        const key = `${n.id}:${sym}`;
        this.#flashing.set(key, this.#flashing.has(key) && !this.#flashing.get(key));
        clearTimeout(this.#timers.get(key));
        this.#timers.set(
          key,
          setTimeout(() => this.#clear(key, n.id), FLASH_MS),
        );
      }
      this.#prev.set(n.id, { ...n.values });
    }
  }

  #clear(key: string, id: number): void {
    this.#flashing.delete(key);
    this.#timers.delete(key);
    if (!this.nodeFlashing(id)) this.#nodeTurns.delete(id);
  }

  isFlashing(id: number, sym: string): boolean {
    return this.#flashing.has(`${id}:${sym}`);
  }

  flashAgain(id: number, sym: string): boolean {
    return this.#flashing.get(`${id}:${sym}`) ?? false;
  }

  nodeFlashAgain(id: number): boolean {
    return this.#nodeTurns.get(id) ?? false;
  }

  // True if any of a node's symbols are flashing — used to flash the node name when its values
  // are hidden (names-only tree).
  nodeFlashing(id: number): boolean {
    for (const key of this.#flashing.keys()) if (key.startsWith(`${id}:`)) return true;
    return false;
  }

  destroy(): void {
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
  }
}
