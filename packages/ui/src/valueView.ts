import {
  isFunctionValue,
  isDehydratedValue,
  isPartialValue,
  isErrorValue,
  isEncodedValue,
  type EncodedValue,
  type PartialValue,
} from '@runespect/agent/protocol/internal';

// Lightweight, dependency-free value rendering: a type label + a collapsed one-line preview,
// so values are scannable without expanding. Works on the encoded values the agent emits and on the
// raw values the experimental production reader sends.

function formatEncoded(v: EncodedValue): string {
  switch (v.__runespect) {
    case 'undefined':
      return 'undefined';
    case 'number':
      return v.value;
    case 'bigint':
      return `${v.value}n`;
    case 'date':
      return v.iso ?? 'Invalid Date';
    case 'regexp':
      return `/${v.source}/${v.flags}`;
    case 'error-object':
      return `${v.name}: ${v.message}`;
    case 'map':
      return `Map(${v.entries.length})`;
    case 'set':
      return `Set(${v.values.length})`;
    case 'urlsearchparams':
      return `URLSearchParams(${v.entries.length})`;
    case 'string':
      return `${v.head}…`;
    case 'instance':
      return `${v.name} ${objectPreview(v.fields)}`;
  }
}

function entriesOfEncoded(v: EncodedValue): [string, unknown][] {
  if (v.__runespect === 'map' || v.__runespect === 'urlsearchparams') {
    return v.entries.map(([k, x]) => [typeof k === 'string' ? k : formatValue(k), x]);
  }
  if (v.__runespect === 'set') return v.values.map((x, i) => [String(i), x]);
  if (v.__runespect === 'instance') return Object.entries(v.fields);
  return [];
}

export function valueType(v: unknown): string {
  if (isPartialValue(v)) return valueType(v.value);
  if (isErrorValue(v)) return 'error';
  // An encoded value's type is its tag; an encoded Error is shown as an error.
  if (isEncodedValue(v)) return v.__runespect === 'error-object' ? 'error' : v.__runespect;
  if (isDehydratedValue(v)) return v.type; // stubbed container: report the real container type
  if (isFunctionValue(v) || typeof v === 'function') return 'function';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof Element !== 'undefined' && v instanceof Element) return 'element'; // not htmldivelement…
  return Object.prototype.toString.call(v).slice(8, -1).toLowerCase();
}

// One-line preview for a DOM element: <tag#id.class1.class2>. Survives only in the in-process
// overlay (elements can't be structured-cloned to the panel), but renders richly where it does.
function elementPreview(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? '.' + [...el.classList].join('.') : '';
  return `<${el.tagName.toLowerCase()}${id}${cls}>`;
}

// A typed array (Uint8Array, Float64Array, …) — drilled into like a plain array. Excludes
// DataView (no indexable `length`). Typed as Uint8Array for ergonomics (length/constructor/iterable
// are shared across all typed arrays); the actual element type may differ.
function isTypedArray(v: unknown): v is Uint8Array {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

// A partial value is named by its full size, not by the entries the wire carried.
function formatPartial(v: PartialValue): string {
  switch (valueType(v.value)) {
    case 'array':
      return `Array(${v.size})`;
    case 'map':
      return `Map(${v.size})`;
    case 'set':
      return `Set(${v.size})`;
    case 'urlsearchparams':
      return `URLSearchParams(${v.size})`;
    default:
      return objectPreview(v.value as Record<string, unknown>).replace(/\(\d+\)$/, `(${v.size})`);
  }
}

export function formatValue(v: unknown): string {
  if (isPartialValue(v)) return formatPartial(v);
  if (isErrorValue(v)) return `⚠ ${v.message}`;
  if (isEncodedValue(v)) return formatEncoded(v);
  if (isDehydratedValue(v)) return v.preview; // stubbed container: show its precomputed preview
  if (isFunctionValue(v) || typeof v === 'function') return v.name ? `ƒ ${v.name}` : 'ƒ';
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (isTypedArray(v)) return `${v.constructor.name}(${v.length})`;
  if (v instanceof ArrayBuffer) return `ArrayBuffer(${v.byteLength})`;
  if (typeof URLSearchParams !== 'undefined' && v instanceof URLSearchParams)
    return `URLSearchParams(${[...v].length})`;
  if (v instanceof Promise) return 'Promise'; // can't inspect its state synchronously — leaf stub
  if (typeof Element !== 'undefined' && v instanceof Element) return elementPreview(v);
  switch (valueType(v)) {
    case 'string': // raw text so an editable input round-trips exactly
      return v as string;
    case 'number':
    case 'boolean':
      return String(v);
    case 'array':
      return `Array(${(v as unknown[]).length})`;
    case 'map':
      return `Map(${(v as Map<unknown, unknown>).size})`;
    case 'set':
      return `Set(${(v as Set<unknown>).size})`;
    case 'date':
      return (v as Date).toISOString();
    case 'regexp':
      return String(v);
    case 'error':
      return `${(v as Error).name}: ${(v as Error).message}`;
    case 'object':
      return objectPreview(v as Record<string, unknown>);
    default:
      return String(v);
  }
}

// Text to put on the clipboard for "copy value": strings verbatim, everything else as JSON
// (falling back to String for non-serialisable values).
export function clipboardText(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

// Entries to show when a value is expanded in the tree (drill into objects/arrays/maps/sets).
// A dehydrated marker has no local entries — the panel fetches them on demand (inspect/hydrate).
export function entriesOf(v: unknown): [string, unknown][] {
  if (isPartialValue(v)) return entriesOf(v.value);
  if (isDehydratedValue(v)) return [];
  if (isEncodedValue(v)) return entriesOfEncoded(v);
  if (isTypedArray(v)) return Array.from(v).map((x, i) => [String(i), x]);
  if (typeof URLSearchParams !== 'undefined' && v instanceof URLSearchParams)
    return [...v.entries()];
  switch (valueType(v)) {
    case 'array':
      return (v as unknown[]).map((x, i) => [String(i), x]);
    case 'object':
      return Object.entries(v as Record<string, unknown>);
    case 'map':
      return [...(v as Map<unknown, unknown>)].map(([k, val]) => [String(k), val]);
    case 'set':
      return [...(v as Set<unknown>)].map((x, i) => [String(i), x]);
    default:
      return [];
  }
}

/** Entries of a partial value that the page has and the panel has not been sent. */
export function unsentCount(v: unknown): number {
  return isPartialValue(v) ? v.size - entriesOf(v.value).length : 0;
}

/** A string the panel shows cut short: long, or cut on the wire already. */
export function isLongString(v: unknown): boolean {
  return (
    (typeof v === 'string' && v.length > STRING_LIMIT) ||
    (isEncodedValue(v) && v.__runespect === 'string')
  );
}

export function isExpandable(v: unknown): boolean {
  if (isErrorValue(v)) return false;
  if (isDehydratedValue(v)) return !v.opaque && v.size > 0; // entries are fetched on expand
  return entriesOf(v).length > 0;
}

// Only values an input can round-trip are edited. An encoded value (a Date, a BigInt, NaN, …) or a
// null would come back from the input as a string, so it is shown read-only.
export function isEditableLeaf(v: unknown): boolean {
  return ['string', 'number', 'boolean'].includes(typeof v);
}

// ── render-bounding (keep the DOM cheap for large values; lazy inspect bounds the wire) ──
/** Max chars shown for a string leaf before truncating (full value stays available on hover). */
export const STRING_LIMIT = 200;
/** Max entries rendered per expanded collection before a "show more" reveals the next page. */
export const ENTRY_LIMIT = 100;

export function truncateString(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function objectPreview(o: Record<string, unknown>): string {
  const keys = Object.keys(o);
  if (!keys.length) return '{}';
  const shown = keys.slice(0, 3).join(', ');
  return `{ ${shown}${keys.length > 3 ? ', …' : ''} } (${keys.length})`;
}
