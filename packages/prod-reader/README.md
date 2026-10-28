# @runespect/prod-reader (experimental)

> **Experimental, private, and not published to npm.** It reads the minified Svelte runtime inside a
> production bundle, which can change on any minor release, so components and values can be missing
> or misnamed. The runespect extension in this repository does not use it.

Reads the component tree and live `state` and `derived` values of a **production** build, for an
app without the plugin: the counterpart of [`@runespect/proxy`](../proxy/README.md) for dev
builds. In a production build the `svelte/internal/client` import is gone and the runtime's
exports are renamed, so it recognizes the runtime functions by how the compiled components call
them, rebuilds the tree from the components' static calls, and redirects the components' import
of the runtime chunk to a wrapper that records each signal. With the build's sourcemap it also
recovers component and field names. Capture is read-only.

Like `@runespect/proxy`, nothing in this repository runs it in a browser today, because that would
need the `debugger` permission; the package is exercised by its tests.

## Install

No build step and nothing on npm, as for [`@runespect/proxy`](../proxy/README.md#install). Depend
on it with `"@runespect/prod-reader": "workspace:*"`.

## Usage

A host that can rewrite the page's script responses uses it like this:

| Export                                                              | What it does                                                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `rewriteProdChunkImport(body, resolveAbs, map?)`                    | For a production component chunk, returns the body with its runtime import redirected to a recording wrapper; otherwise `null`          |
| `hasDevSeam(body)`                                                  | Whether a script is a dev build (still imports `svelte/internal/client`); those belong to `@runespect/proxy`                            |
| `bootModuleProd()`                                                  | Source to inject after the dev `bootModule()` of `@runespect/proxy`: `window.__runespectReconstruct()` then returns the production tree |
| `staticTreeForChunk(chunk, map?)`                                   | The component tree of one chunk and how many signals each component creates                                                             |
| `readProdNodeChunk(code)`, `componentNamesFromSourcemap(code, map)` | The lower-level analysis: the runtime functions it recognized, the tree, and names from a sourcemap                                     |

`resolveAbs` maps the chunk's relative import of the runtime to the absolute URL the wrapper
imports. Pass the sourcemap (`build.sourcemap: true` in Vite) to get real names.

## Limitations

- Without a sourcemap, components show as their minified function names and values as plain
  `state` and `derived`.
- Values are matched to components by the order the signals were created. That is exact for
  straight-line rendering and can be wrong under `{#if}` and `{#each}`.
- Read-only: no editing.
- It recognizes the runtime by usage patterns; a Svelte release that changes them breaks it.

## Tests

```sh
pnpm --filter @runespect/prod-reader test
```

The tests run against a SvelteKit production build checked in under `test/fixtures`.
[Tiers](../../docs/explanation/tiers.md#capture-experimental-not-released) has the capture's place
among runespect's data sources.
