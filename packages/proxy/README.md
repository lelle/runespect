# @runespect/proxy (experimental)

> **Experimental, private, and not published to npm.** It reads Svelte's private runtime, which can
> change on any minor release, so values can be missing or misnamed. The runespect extension in this
> repository does not use it.

Building blocks for capturing a **development** build of a Svelte app that does not use the
runespect plugin: the compiled components' `svelte/internal/client` import is redirected to a
wrapper that records every component, `state` and `derived`, and the recorded tree is shown in the
page or sent to the runespect panel. Capture is read-only. Despite the name, there is no proxy
server.

Doing this from a browser means intercepting the page's module responses, which needs the
`debugger` permission. The runespect extension does not request it, so nothing in this repository
runs a capture today; the package is exercised by its tests.

## Install

There is no build step and nothing to install from npm. Inside this workspace, depend on it with
`"@runespect/proxy": "workspace:*"`; it exports its TypeScript sources (`src/index.ts`) directly.

## Usage

A host that can rewrite the page's module responses uses it like this:

| Export                                      | What it does                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `importsSvelteInternal(code)`               | Whether a served module imports `svelte/internal/client` (bare or as a Vite optimized dependency)               |
| `rewriteSvelteInternalImport(code, url)`    | Points that import at the recording wrapper served at `url`                                                     |
| `wrapperModule(originalUrl)`                | The wrapper's source: re-exports the real runtime and records what the compiled components create               |
| `bootModule()`                              | Defines `window.__runespectReconstruct()`, which rebuilds the component tree from the recording                 |
| `bridgeModule()`                            | Posts that tree to the page every second in the panel's message format, so the extension's relay can forward it |
| `overlayModule()` / `mountCaptureOverlay()` | A read-only tree overlay inside the page, in plain DOM                                                          |

The module sources are self-contained strings, so they can be served to a page that cannot resolve
bare imports.

## Limitations

- Dev builds only: a production bundle has no `svelte/internal/client` import to redirect (see
  `@runespect/prod-reader`).
- Read-only: no editing.
- When the runtime lacks a function the recording relies on, the page gets the real runtime
  untouched and the panel shows **Capture stopped** with the reason.

## Tests

```sh
pnpm --filter @runespect/proxy test
```

`apps/playground/test/capture-dev.test.ts` also runs real compiled components through the
wrapper. [Tiers](../../docs/explanation/tiers.md#capture-experimental-not-released) describes
where capture sits among the ways runespect gets its data.
