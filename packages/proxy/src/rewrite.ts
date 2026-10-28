// Pure transforms a capture host applies to served responses. No I/O — unit-testable.

// Match the svelte internals module in either form a served module uses:
//   - the bare specifier  `svelte/internal/client`
//   - Vite's optimised-dep URL  `/node_modules/.vite/deps/svelte_internal_client.js?v=…`
const SVELTE_INTERNAL = /svelte[_/]internal[_/]client/;

export function importsSvelteInternal(code: string): boolean {
  return SVELTE_INTERNAL.test(code);
}

/**
 * Rewrite a served compiled-component module so its `svelte/internal/client` import points at
 * the recording wrapper instead. Only touches import/export-from specifiers that
 * reference the svelte internals module; leaves everything else intact.
 */
export function rewriteSvelteInternalImport(code: string, wrapperUrl: string): string {
  return code.replace(
    /((?:from|import)\s*['"])([^'"]*svelte[_/]internal[_/]client[^'"]*)(['"])/g,
    (_m, pre: string, _spec: string, post: string) => `${pre}${wrapperUrl}${post}`,
  );
}
