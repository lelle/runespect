# Working in this repo

runespect is a Svelte 5 devtools: a Vite plugin instruments components, an agent in the page holds
the tree, and the panel renders it: in a window the dev server serves, in an overlay, or in a Chrome
DevTools tab. See [`docs/reference/packages.md`](docs/reference/packages.md#the-repository) for the
layout and [`docs/explanation/architecture.md`](docs/explanation/architecture.md) for the design.

## Debugging — start here

The chain spans five contexts and four of them are invisible to the page, so guessing is expensive.
Every hop records what crossed it into the **inspected page**:

```js
Object.groupBy(window.__runespect.events, (e) => e.hop); // agent, relay, panel-port, panel
window.__runespect.dump(); // the whole timeline as JSON
```

- [`docs/how-to/troubleshoot.md`](docs/how-to/troubleshoot.md) — symptom → what to read → what it means
- [`docs/reference/event-log.md`](docs/reference/event-log.md) — the event contract, and how hops mirror inward

A missing hop is the answer. The log carries envelopes only, never the app's values, so a dump is
safe to paste anywhere.

## Verifying a change

| Level                           | Command                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| type-check, lint, format, tests | `pnpm verify`                                                 |
| browser, the app path           | `pnpm e2e`                                                    |
| browser, extension loaded       | `pnpm test:extension`, with the playground dev server on 5187 |

[`CONTRIBUTING.md`](./CONTRIBUTING.md#tests) lists what each command needs first.

`pnpm test:extension` runs the real unpacked extension. The `panel` and `panel-port` hops cannot be
automated — no tool can select a DevTools panel — so changes there need a manual pass, and saying so
is better than implying coverage that doesn't exist.

## What this codebase expects

- **Tests first.** Every fix here starts as a failing test that reproduces the report; see the
  regression tests around dropped message kinds, un-cloneable values and the panel port.
- **Verify against a real app.** The playground is small and forgiving. Check a change against a
  larger SvelteKit app with class instances, services and hundreds of components: that is where the
  bugs the playground hides show up.
- **Never make the inspected app look broken.** Warnings and errors runespect provokes belong to
  runespect, not to the app's console.
