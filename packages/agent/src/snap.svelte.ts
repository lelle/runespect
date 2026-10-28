import { dehydrate, isPlainObject } from './protocol/internal';

// Whether a value is a container $state.snapshot can copy cleanly.
function isSnapshotContainer(v: object): boolean {
  return isPlainObject(v) || Array.isArray(v) || v instanceof Map || v instanceof Set;
}

// Own enumerable methods — a services bag or a store literal. Prototype methods (a class instance)
// are not own properties, which is why the container check above catches those instead.
function holdsFunction(v: object): boolean {
  try {
    return Object.values(v).some((x) => typeof x === 'function');
  } catch {
    return true; // a getter threw: exotic enough that snapshotting it is not worth the risk
  }
}

// Clone a reported value to a plain snapshot. Used by injected instrumentation.
//
// $state.snapshot() logs state_snapshot_uncloneable for every function it meets — and returns the
// originals anyway, so the warning buys nothing. Those lines land in the INSPECTED APP's console,
// where a devtool has no business making the app look broken. Anything carrying methods (services,
// stores, class instances) is therefore passed through untouched; dehydrate() stubs it before it
// reaches the wire, and passing the instance through is what keeps its class name in the preview.
export function snap(v: unknown): unknown {
  if (typeof v === 'function') return v;
  if (v === null || typeof v !== 'object') return v;
  // A SvelteURLSearchParams is copied like a Set.
  if (v instanceof URLSearchParams) return new URLSearchParams(v);
  if (!isSnapshotContainer(v) || holdsFunction(v)) return v;
  return quietSnapshot(v);
}

// What $state.snapshot does not copy is passed through, the same object before and after a change: a
// SvelteDate, a SvelteURL, a class with $state fields, a MediaQuery. Called inside the reporting
// effect, this reads what the wire will send of it, so a change to it reports again. A field that
// throws is shown as that error by dehydrate itself.
export function track(v: unknown): void {
  if (v !== null && typeof v === 'object' && !isSnapshotContainer(v)) void dehydrate(v, 1);
}

// Methods can sit at any depth (a services bag nested inside a state object is the shape seen in
// practice), and walking every value to find them would cost more than the snapshot itself. So the
// one warning our own call provokes is filtered for the duration of that call — its consequence
// ("the return value contains the originals") is understood and handled downstream by dehydrate().
// Everything else the app logs, including every other Svelte warning, passes through untouched.
function quietSnapshot(v: object): unknown {
  const warn = console.warn;
  console.warn = (...args: unknown[]): void => {
    if (String(args[0] ?? '').includes('state_snapshot_uncloneable')) return;
    warn.apply(console, args);
  };
  try {
    return $state.snapshot(v);
  } finally {
    console.warn = warn;
  }
}
