# Packages

## What an app installs

| Package                  | Install                  | What it is                                                                 |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| `@runespect/vite-plugin` | dev dependency           | the preprocessor and the Vite plugin: instrumentation and the panel window |
| `@runespect/agent`       | comes with the plugin    | the runtime in the page the instrumented code reports to                   |
| `@runespect/ui`          | dev dependency, optional | the `<Inspect>` overlay                                                    |

The three share one version: a release of any of them releases all three. Each has a public entry
point, which is what it promises to keep, and an undocumented `/internal` one that the other
packages use and that can change with any release. The agent also carries the protocol: the types
under `@runespect/agent/protocol`, the wire format under `@runespect/agent/protocol/internal`.

## Requirements

- Svelte 5.20.5 or newer
- Vite 6, 7 or 8, with `@sveltejs/vite-plugin-svelte` or SvelteKit
- Node 20.19+ on the 20 line, or 22.12 and newer
- Chrome 111 or newer for the extension

CI tests the lowest Svelte with Vite 6 and 7, and the newest with Vite 8. Before Svelte 5.57.0, a
`$derived` that threw once (for example `user!.name` behind an `{#if user}`) can keep showing its
error in the panel after the app recovers. Before Svelte 5.37.1, a pane of the panel that fails to
render takes the rest of the panel with it.

## The repository

What is shipped lives in `packages/`; the apps that document, show and test it live in `apps/`.

```
packages/
  agent/         @runespect/agent         # reactive in-page agent; src/protocol/: wire messages,
                                          # value serialization, node types
  vite-plugin/   @runespect/vite-plugin   # build-time instrumentation + the panel window
  ui/            @runespect/ui            # the panel and the <Inspect> overlay
  extension/     @runespect/extension     # MV3 browser-extension devtools panel
  proxy/         @runespect/proxy         # experimental, not on npm: capture of a dev build
  prod-reader/   @runespect/prod-reader   # experimental, not on npm: capture of a production build
apps/
  playground/    (private)                # showcase app with the plugin; hosts the tests
  sveltekit-spa/ (private)                # a SvelteKit app without the plugin, for the fallbacks
  site/          (private)                # the project site on GitHub Pages, built from docs/
  demo/          (private)                # the shop next to the panel that the site serves at /demo/
```

The two test apps are deliberately different: `playground` uses the plugin, and `sveltekit-spa`
stays plugin-free so the extension's fallback paths have a real target (`pnpm dev:spa`, port 5181).
The extension has its own version and goes to the Chrome Web Store, not to npm.
