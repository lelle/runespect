# Options

`@runespect/vite-plugin` exports two functions, and an app needs both.

## `runespectPreprocess(options?)`

A Svelte preprocessor that instruments each component, so its state, derived values, props and
stores are reported to the agent.

| Option    | Type      | Default                            | What it does                                                             |
| --------- | --------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `include` | `RegExp`  | every `.svelte`                    | Only files whose path matches are instrumented.                          |
| `enabled` | `boolean` | while `runespect()` serves the app | `true` instruments where the dev server does not run, such as in Vitest. |

It never runs when `NODE_ENV` is `production`, whatever `enabled` says, and never on files under
`node_modules`, `.svelte-kit` or runespect's own packages.

Put it last in the `preprocess` list. It reads each component as plain Svelte, so a component that
another preprocessor still has to turn into JavaScript or CSS, such as `<script lang="coffee">`, is
read after that preprocessor or not at all. A component it cannot read is compiled without
runespect, and the dev server warns once:

```
[runespect] could not read /app/src/Counter.svelte, so it runs without runespect. If it needs another
preprocessor first, put runespectPreprocess() last in the list.
```

## `runespect(options?)`

A Vite plugin that applies only to the dev server, unless `includeInRelease` is on. It:

- adds the agent to the page and connects it to the panel window over Vite's HMR channel, and to
  the extension over `window.postMessage`
- serves the panel window at `/__runespect/`, under the app's `base`
- instruments top-level `$state`, `$derived`, rune-class instances and `svelte/reactivity`
  collections in `.svelte.ts` and `.svelte.js` modules outside `node_modules`, shown under
  **Modules** in the tree

| Option             | Type      | Default | What it does                                                                                                     |
| ------------------ | --------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `openInEditor`     | `boolean` | `true`  | `false` removes **Open in editor** from the panel window, the overlay and the extension. Its links open VS Code. |
| `includeInRelease` | `boolean` | `false` | `true` builds runespect into the code `vite build` produces. See below.                                          |
| `panelInRelease`   | `boolean` | `true`  | With `includeInRelease`, `false` leaves the panel window out of the build.                                       |

Turn `openInEditor` off when your editor does not open `vscode://` links, or when the dev server
runs on another machine than your editor.

Unless `includeInRelease` is on, `vite build` does not run it, so a production build carries none of
it.

### `includeInRelease`

Builds the agent and the instrumentation into the app, for a dev or test environment without a dev
server. The extension and the panel window at `/__runespect/` then show the app as Live, and
**Open in editor** is off. The window is plain files next to the app, loaded only when someone opens
the address. It reaches the page through the browser, so it has to be open in the same browser, on
the same origin, as the app. The overlay is not part of this.

```ts
runespect({ includeInRelease: process.env.DEPLOY_ENV === 'test' });
```

**Do not let this reach production.** Anyone who can open the build can read and edit its component
state, with a ready-made panel at a known address, and it contains your project-relative source paths. `runespect` cannot tell which environment
a build is for, so:

- Write the test so a forgotten variable gives a clean build: `=== 'test'`, not `!== 'production'`.
- Build separately for each environment. A build promoted from test to production keeps runespect.

When the extension is all you use, leave the window out, so there is no folder to remove in CI:

```ts
runespect({ includeInRelease: process.env.DEPLOY_ENV === 'test', panelInRelease: false });
```

The state can still be read from `window.__runespect` and edited from the extension.

The build log says when it is on, and the build grows: 25 KB before compression on our playground.

A `.svelte.ts` or `.svelte.js` module it cannot read is served without runespect, with the same
warning once.

## What is reported

- **Runes mode:** `$state`, `$derived`, `$props()` (destructured or as one object), fields of a
  local class that declares `$state` or `$derived`, collections made with `new` from
  `svelte/reactivity` (`SvelteSet`, `SvelteMap`, …), store reads (`$store`), `getContext(...)`
  results, and the values passed to `setContext(key, value)`.
- **Legacy mode:** `export let` props, top-level `let`, names assigned by `$: x = ...`, store reads,
  `getContext(...)` results and the values passed to `setContext(key, value)`.
- **Neither:** only what can be read without deciding the component's mode for it: `getContext(...)`
  results, the values passed to `setContext(key, value)`, and store reads, the stores through their
  own subscription.
- **Every mode:** an instance made with `new` of a class imported from a `.svelte`, `.svelte.js` or
  `.svelte.ts` file, as one value that opens to its fields. Its class is declared elsewhere, so its
  fields are not known when the component compiles, and they are read-only.

Only top-level declarations of a component's instance script are reported, exported ones included.
Editable from the panel: `let` state, `$bindable()` props and `$state` class fields. Everything else is read-only.
