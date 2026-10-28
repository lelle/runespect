import { isEncodedValue, isPartialValue } from './internal.ts';

// A path into a value is [symbol, ...steps]. It is walked three times: the panel builds it from what
// it shows, the page reads the live value at it, and the panel splices the reply into its copy. A Map
// or Set child is addressed by its entry index, since its key may be an object or stringify like
// another key. The rule lives here so the three walks cannot disagree.

export type Step = string | number;

/** The step to a child the panel shows: its entry index inside a Map or Set, else its key. */
export function childStep(container: unknown, key: string, index: number): Step {
  return indexed(container) ? index : key;
}

function indexed(v: unknown): boolean {
  if (isPartialValue(v)) return indexed(v.value);
  if (v instanceof Map || v instanceof Set) return true;
  return isEncodedValue(v) && (v.__runespect === 'map' || v.__runespect === 'set');
}

/** The live value at `steps`, or undefined if it is not there. A getter on the way may throw. */
export function readLive(root: unknown, steps: ReadonlyArray<Step>): unknown {
  let cur = root;
  for (const step of steps) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (cur instanceof Map) {
      cur = [...cur][Number(step)]?.[1];
    } else if (cur instanceof Set) {
      cur = [...cur][Number(step)];
    } else {
      cur = Array.isArray(cur) ? cur[Number(step)] : (cur as Record<string, unknown>)[String(step)];
    }
  }
  return cur;
}

// Returns a copy of the encoded `root` with `steps` set to `value`; untouched branches are shared.
// Descends plain objects, arrays, expanded class instances, partial values and encoded Maps and
// Sets. An empty path replaces the whole value. A reply can arrive after a Map or Set shrank, so an
// entry it no longer has leaves it unchanged.
export function writeEncoded(root: unknown, steps: ReadonlyArray<Step>, value: unknown): unknown {
  if (steps.length === 0) return value;
  if (isPartialValue(root)) return { ...root, value: writeEncoded(root.value, steps, value) };
  const [head, ...rest] = steps;
  if (isEncodedValue(root) && root.__runespect === 'map') {
    const i = Number(head);
    if (!root.entries[i]) return root;
    const entries = root.entries.slice();
    entries[i] = [entries[i][0], writeEncoded(entries[i][1], rest, value)];
    return { ...root, entries };
  }
  if (isEncodedValue(root) && root.__runespect === 'instance') {
    return { ...root, fields: writeEncoded(root.fields, steps, value) };
  }
  if (isEncodedValue(root) && root.__runespect === 'set') {
    if (Number(head) >= root.values.length) return root;
    return { ...root, values: writeEncoded(root.values, steps, value) };
  }
  if (Array.isArray(root)) {
    const copy = root.slice();
    const i = Number(head);
    copy[i] = writeEncoded(copy[i], rest, value);
    return copy;
  }
  if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    return { ...obj, [head]: writeEncoded(obj[head as string], rest, value) };
  }
  return value;
}
