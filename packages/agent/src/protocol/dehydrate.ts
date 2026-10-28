export interface DehydrateOptions {
  /** Expand a class instance at the top into its fields, as an answer to `inspect`. */
  expandInstance?: boolean;
  /** False where nobody answers `inspect` (a capture): stubs are then final, not expandable. */
  inspectable?: boolean;
  /** How many entries of the value itself to send, for a panel that asked for more. */
  limit?: number;
}

// Serialize a value for the wire, to a bounded depth. Every channel ends up as JSON somewhere (the
// extension relay, the HMR socket), so values JSON cannot carry are encoded, and a container deeper
// than `depth` becomes a dehydrated marker (preview only) the panel can fetch via inspect/hydrate.
// A value no channel can copy (methods, DOM nodes, Promises, proxies) aborts a whole message, so it
// is stubbed too. A container wider than ITEMS or a string longer than CHARS is cut to that, with its
// full size, so one large value does not make every message as large as itself.
//
// Self-contained: it references nothing outside its own body, because the capture bridge embeds it
// in the page with toString(). That keeps one encoder for the agent and for captures.
export function dehydrate(value: unknown, depth: number, options: DehydrateOptions = {}): unknown {
  const ITEMS = 100;
  const CHARS = 10_000;
  type Marker = {
    __runespect: 'dehydrated';
    type: string;
    preview: string;
    size: number;
    opaque?: true;
  };

  const isPlainObject = (v: unknown): v is Record<string, unknown> => {
    if (v === null || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  };
  const isEncodableBuiltin = (v: object): boolean =>
    v instanceof Date || v instanceof RegExp || v instanceof Error;
  const isSearchParams = (v: unknown): v is URLSearchParams =>
    typeof URLSearchParams !== 'undefined' && v instanceof URLSearchParams;
  const isClassInstance = (v: unknown): v is object =>
    v !== null &&
    typeof v === 'object' &&
    !isPlainObject(v) &&
    !Array.isArray(v) &&
    !(v instanceof Map) &&
    !(v instanceof Set) &&
    !isSearchParams(v) &&
    !(v instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(v) &&
    !isEncodableBuiltin(v);
  // The constructor name of a non-plain object, when it has a useful one.
  const className = (v: unknown): string | null => {
    const name = (v as { constructor?: { name?: string } })?.constructor?.name;
    return name && name !== 'Object' ? name : null;
  };
  // What a reader of a class instance wants: its own data, and the get/set pairs Svelte compiles a
  // $state field into. A getter without a setter is computed by the app and is left unread, except
  // `current`: Svelte's name for the value of a reactive class (MediaQuery, createSubscriber). Either
  // makes the instance `reactive`: state, sent with its fields so a change to one reaches the panel,
  // where a service with only methods and plain fields stays a stub. A DOM node is shown by its
  // preview only: its accessors number in the hundreds.
  const fieldsOf = (v: object): { names: string[]; reactive: boolean } => {
    if (typeof Node !== 'undefined' && v instanceof Node) return { names: [], reactive: false };
    const names = new Set(Object.keys(v));
    let reactive = false;
    for (
      let p = Object.getPrototypeOf(v);
      p && p !== Object.prototype;
      p = Object.getPrototypeOf(p)
    ) {
      for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(p))) {
        if (d.get && (d.set || (k === 'current' && !names.has(k)))) {
          names.add(k);
          reactive = true;
        }
      }
    }
    return { names: [...names], reactive };
  };

  const inspectable = options.inspectable ?? true;
  const marker = (type: string, preview: string, size: number, opaque = !inspectable): Marker =>
    opaque
      ? { __runespect: 'dehydrated', type, preview, size, opaque: true }
      : { __runespect: 'dehydrated', type, preview, size };

  const stub = (v: object, names?: string[]): Marker => {
    if (Array.isArray(v)) return marker('array', `Array(${v.length})`, v.length);
    if (v instanceof Map) return marker('map', `Map(${v.size})`, v.size);
    if (v instanceof Set) return marker('set', `Set(${v.size})`, v.size);
    if (isSearchParams(v)) {
      const size = [...v.keys()].length;
      return marker('urlsearchparams', `URLSearchParams(${size})`, size);
    }
    // Binary data is shown by its size only: its bytes are rarely what a reader is after, and a
    // large buffer would make every message slow.
    if (v instanceof ArrayBuffer) {
      return marker('arraybuffer', `ArrayBuffer(${v.byteLength})`, v.byteLength, true);
    }
    if (ArrayBuffer.isView(v)) {
      const size = 'length' in v ? (v as Uint8Array).length : v.byteLength;
      return marker('typedarray', `${v.constructor.name}(${size})`, size, true);
    }
    const keys = isClassInstance(v) ? (names ?? fieldsOf(v).names) : Object.keys(v);
    const shown = keys.slice(0, 3).join(', ');
    const body = keys.length ? `{ ${shown}${keys.length > 3 ? ', …' : ''} }` : '{}';
    // Name the class when there is one: `AuthService { token, … } (4)` says far more about a stub
    // than `{ … }`, and it is the only clue left once the instance itself cannot cross the wire.
    const cls = className(v);
    return marker('object', `${cls ? `${cls} ` : ''}${body} (${keys.length})`, keys.length);
  };

  const leaf = (v: unknown): unknown => {
    if (typeof v === 'string' && v.length > CHARS) {
      return { __runespect: 'string', head: v.slice(0, CHARS), length: v.length };
    }
    if (typeof v === 'function') return { __runespect: 'function', name: v.name };
    // Svelte parks an uncomputed derived at Symbol(uninitialized), and the description is what a
    // reader wants anyway.
    if (typeof v === 'symbol') return String(v);
    if (v === undefined) return { __runespect: 'undefined' };
    if (typeof v === 'number' && !Number.isFinite(v)) {
      return { __runespect: 'number', value: String(v) };
    }
    if (typeof v === 'bigint') return { __runespect: 'bigint', value: String(v) };
    if (v instanceof Date) {
      return { __runespect: 'date', iso: Number.isNaN(v.getTime()) ? null : v.toISOString() };
    }
    if (v instanceof RegExp) return { __runespect: 'regexp', source: v.source, flags: v.flags };
    if (v instanceof Error)
      return { __runespect: 'error-object', name: v.name, message: v.message };
    return v;
  };

  // The first `max` items of a collection, without copying the rest.
  const first = <T>(all: Iterable<T>, max: number): T[] => {
    const out: T[] = [];
    for (const x of all) {
      if (out.length === max) break;
      out.push(x);
    }
    return out;
  };
  // A plain object's size and its first `max` entries, in one pass over its keys.
  const firstEntries = (o: Record<string, unknown>, max: number): [[string, unknown][], number] => {
    const out: [string, unknown][] = [];
    let size = 0;
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (out.length < max) out.push([k, o[k]]);
      size++;
    }
    return [out, size];
  };

  const seen = new Set<object>();
  const walk = (v: unknown, d: number, max = ITEMS): unknown => {
    if (
      Array.isArray(v) ||
      isPlainObject(v) ||
      v instanceof Map ||
      v instanceof Set ||
      isSearchParams(v)
    ) {
      if (d <= 0 || seen.has(v)) return stub(v);
      seen.add(v);
      let size: number;
      let encoded: unknown;
      if (Array.isArray(v)) {
        size = v.length;
        encoded = first(v, max).map((x) => walk(x, d - 1));
      }
      // Keys are encoded like values: a DOM element or a class instance is a common Map key.
      else if (v instanceof Map) {
        size = v.size;
        encoded = {
          __runespect: 'map',
          entries: first(v, max).map(([k, x]) => [walk(k, d - 1), walk(x, d - 1)]),
        };
      } else if (v instanceof Set) {
        size = v.size;
        encoded = { __runespect: 'set', values: first(v, max).map((x) => walk(x, d - 1)) };
      } else if (isSearchParams(v)) {
        size = [...v.keys()].length;
        encoded = {
          __runespect: 'urlsearchparams',
          entries: first(v, max).map(([k, x]) => [walk(k, d - 1), walk(x, d - 1)]),
        };
      } else {
        const [entries, count] = firstEntries(v, max);
        size = count;
        encoded = Object.fromEntries(entries.map(([k, x]) => [k, walk(x, d - 1)]));
      }
      return size > max ? { __runespect: 'partial', value: encoded, size } : encoded;
    }
    if (isClassInstance(v)) {
      const { names, reactive } = fieldsOf(v);
      // Reactive state (a URL among it: its parts are get/set pairs) is sent with its fields, so a
      // change to one reaches the panel. Any other class instance (a store, a service, an SDK
      // client) is a stub.
      if (d <= 0 || seen.has(v) || !reactive) return stub(v, names);
      seen.add(v);
      return expand(v, d - 1, names);
    }
    // Binary data.
    if (v !== null && typeof v === 'object' && !isEncodableBuiltin(v)) return stub(v);
    return leaf(v);
  };
  const expand = (v: object, d: number, names = fieldsOf(v).names): unknown => {
    const fields: Record<string, unknown> = {};
    for (const k of names) {
      try {
        fields[k] = walk((v as Record<string, unknown>)[k], d);
      } catch (error) {
        fields[k] = {
          __runespect: 'error',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return { __runespect: 'instance', name: className(v) ?? 'Object', fields };
  };

  if (options.expandInstance && isClassInstance(value)) return expand(value, 0);
  return walk(value, depth, options.limit ?? ITEMS);
}
