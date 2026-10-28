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

A Vite plugin that applies only to the dev server (`apply: 'serve'`). It:

- adds the agent to the page and connects it to the panel window over Vite's HMR channel, and to
  the extension over `window.postMessage`
- serves the panel window at `/__runespect/`, under the app's `base`
- instruments top-level `$state`, `$derived`, rune-class instances and `svelte/reactivity`
  collections in `.svelte.ts` and `.svelte.js` modules outside `node_modules`, shown under
  **Modules** in the tree

| Option         | Type      | Default | What it does                                                                                                     |
| -------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `openInEditor` | `boolean` | `true`  | `false` removes **Open in editor** from the panel window, the overlay and the extension. Its links open VS Code. |

Turn `openInEditor` off when your editor does not open `vscode://` links, or when the dev server
runs on another machine than your editor.

`vite build` never runs it, so a production build carries none of it.

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
