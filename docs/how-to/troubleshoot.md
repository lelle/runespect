# Troubleshooting

Start from what you see. Every entry says what to run, what the answer means, and what to do —
so a developer and a coding agent follow the same path.

The one command behind most of this, run in the **inspected page's** console (not the panel's):

```js
Object.groupBy(window.__runespect.events, (e) => e.hop);
```

Which hops you should see depends on where you look at the state:

| Where                          | Hops                                       | How the panel gets the data                  |
| ------------------------------ | ------------------------------------------ | -------------------------------------------- |
| Panel window (`/__runespect/`) | `agent`                                    | over the dev server's HMR channel            |
| In-page overlay (`<Inspect>`)  | `agent`                                    | reads the agent in the same page             |
| Browser extension              | `agent` → `relay` → `panel-port` → `panel` | content script, service worker, DevTools tab |

Only the extension's hops are mirrored into the page, so with the panel window or the overlay an
`agent` hop alone is the whole chain. With the extension, a missing hop is the answer. See
[Event log](../reference/event-log.md) for the event shape.

## The panel window is blank, or shows the app instead

`/__runespect/` is served from the panel bundle inside `@runespect/vite-plugin`. When the bundle is
missing, the dev server falls through to the app's own page or a 404. From an npm install that means
a broken package; report it. From a clone of this repository, build it first:
`pnpm --filter @runespect/vite-plugin build`.

Under a Vite `base`, the panel moves with the app: with `base: '/app/'` it is at
`/app/__runespect/`.

## The panel says "Tier 1 — component names only"

The page never told the panel which tier it is. Either the app isn't instrumented, or the
handshake did not arrive.

```js
window.__runespect_tier0; // true  → the app IS running the plugin
window.__runespect.events.filter((e) => e.kind === 'hello');
```

| What you find                          | What it means                                                  |
| -------------------------------------- | -------------------------------------------------------------- |
| `__runespect_tier0` is `undefined`     | the plugin isn't active — the dev server started without it    |
| `tier0` true, no `hello` in the events | the agent never announced; check the `agent` hop exists at all |
| `hello` in `agent` but not in `panel`  | it died in the chain — find the last hop that has it           |

Nothing wrong with Tier 1 itself: it is the DOM-walk fallback and it cannot carry state. To get
live values, add the plugin to the app ([Tiers](../explanation/tiers.md)).

## The tree was live, then stopped updating

With the extension, usually the panel's port died with MV3's idle service worker.

```js
window.__runespect.events.filter((e) => e.hop === 'panel-port');
```

| Pattern                       | Meaning                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `disconnect` then `reconnect` | worked as designed — the port re-established itself       |
| `disconnect`, no `reconnect`  | the reconnect is broken; this is a bug, capture `dump()`  |
| only `connect`                | the port is fine — the silence is upstream, check `agent` |

If `agent` shows `tx` events the whole time and `panel` shows no matching `rx`, the message died
between them: look at `relay` next.

## Values are missing, or one component shows nothing

```js
window.__runespect.events.filter((e) => e.ev === 'drop');
```

A `drop` with `error: 'DataCloneError'` means the wire refused a value: the payload held something
structured-clone can't copy. The agent stubs class instances, functions and symbols, so a drop is a
gap in that coverage — worth a fix, with the offending shape in the report.

No drops and still no values? The component may genuinely have no reactive state — the panel's
detail pane says "No reactive values" for those. Confirm by selecting a component you know has
`$state`.

## Nothing at all in the panel

The status says **No app** when no page has answered two seconds after the panel opened.

```js
window.__runespect; // undefined → the agent never connected in this page
```

`undefined` means the page is not instrumented at all (no plugin), or the app crashed
before the agent ran. Check the app's own console for errors first: runespect loads with the app.
In a SvelteKit app the plugin loads the agent through Kit's generated client entry; a Kit version
that moved it would leave the agent out, and `pnpm test:pack` checks that against Kit 2 and 3.

## The dev server warns `[runespect] could not read …`

runespect could not read that file as Svelte, so it left it out: the file works, it just is not in
the panel. For a component, the usual cause is a preprocessor that runs after
`runespectPreprocess()`, for a `<script lang="…">` or a `<template lang="…">`. Put
`runespectPreprocess()` last in the `preprocess` list ([Options](../reference/options.md)).

## runespect shows up in Storybook

`storybook dev` reuses the app's `vite.config`, so the components in a story are instrumented and
the agent runs in the preview like in the app. It changes nothing in the stories. To leave it out,
filter the plugin in `.storybook/main.js`:

```js
export default {
  // …stories, framework
  viteFinal: (config) => ({
    ...config,
    plugins: config.plugins.flat().filter((plugin) => plugin?.name !== 'runespect'),
  }),
};
```

Without `runespect()`, `runespectPreprocess()` does not run either. `storybook build` is a production
build and never carries runespect.

## The extension panel is stale after reloading the extension

Content scripts are injected at page load, so a tab that was open when the extension reloaded has
no relay in it. Reload the tab. In that state the `relay` hop is missing entirely from the events.

## Capturing a report

```js
copy(window.__runespect.dump()); // whole timeline to the clipboard
```

The dump carries kinds, counts and lifecycle — never the app's values — so it is safe to paste into
an issue or hand to an agent.

## Verifying a fix

[`CONTRIBUTING.md`](../../CONTRIBUTING.md#tests) lists every test command and what it needs first.
`pnpm test:extension` loads the real unpacked extension and asserts the `agent` and `relay` hops
reach the page. The `panel` and `panel-port` hops cannot be driven by automation — no tool can
select a DevTools panel — so those are covered by unit tests and by the manual check at the top of
this page.
