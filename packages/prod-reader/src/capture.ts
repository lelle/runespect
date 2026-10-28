import { resolveHookTargets, generateChunkWrapper, staticTreeForChunk } from './runtime-hook.js';
import type { RawSourceMap } from './sourcemap.js';

// The per-chunk decision a capture host applies to each script response it intercepts: is this a
// production component chunk (a build, where the dev `svelte/internal/client` seam is gone)? If so,
// redirect its runtime-chunk import to a self-contained recording wrapper. Pure + unit-tested; the
// host calls this and serves the rewritten body.

// A dev component still has the svelte/internal/client seam — the dev capture path handles those.
export function hasDevSeam(body: string): boolean {
  return /svelte[_/]internal[_/]client/.test(body);
}

export interface ProdRewrite {
  /** the runtime chunk specifier whose import was redirected */
  runtimeRef: string;
  /** the body to serve in place of the original */
  rewritten: string;
}

function redirectImport(body: string, ref: string, url: string): string {
  const esc = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('((?:from|import)\\s*[\'"])' + esc + '([\'"])', 'g');
  return body.replace(re, (_m, pre: string, post: string) => pre + url + post);
}

// Returns the rewritten body (runtime-chunk import → recording wrapper data: url) plus the chunk it
// hooked, or null if this response is not a prod component chunk. `resolveAbs` maps the relative
// chunk specifier to the absolute url the wrapper statically re-imports (the interceptor knows it).
export function rewriteProdChunkImport(
  body: string,
  resolveAbs: (ref: string) => string,
  sourcemap?: RawSourceMap,
): ProdRewrite | null {
  if (hasDevSeam(body)) return null; // dev path owns this one

  let chunkRef: string;
  let exports: { state?: string; derived?: string; get?: string; set?: string };
  try {
    ({ chunkRef, exports } = resolveHookTargets(body));
  } catch {
    return null; // not parseable as an ES module / not a component chunk
  }
  if (!chunkRef || !exports.state || !exports.derived || !exports.get) return null;
  // One export for both roles would be exported twice by the wrapper and fail the page's module.
  if (exports.state === exports.derived) return null;

  // with a sourcemap, component labels are recovered from the source files (else they stay `<y>`)
  const tree = staticTreeForChunk(body, sourcemap);
  if (!tree) return null;

  const wrapper = generateChunkWrapper(resolveAbs(chunkRef), exports, JSON.stringify(tree));
  const dataUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(wrapper);
  const rewritten = redirectImport(body, chunkRef, dataUrl);
  if (rewritten === body) return null; // nothing redirected

  return { runtimeRef: chunkRef, rewritten };
}
