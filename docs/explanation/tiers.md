# Tiers: where the panel's data comes from

The panel's status chip says which tier it is talking to. Each tier is a different way of getting
the component tree, and they differ in how much they can show.

| Tier                       | How you get it                          | Tree        | Live values | Editing | Source file |
| -------------------------- | --------------------------------------- | ----------- | ----------- | ------- | ----------- |
| **0: the plugin**          | `runespectPreprocess()` + `runespect()` | yes         | yes         | yes     | yes         |
| **1: the extension alone** | install the extension, open a dev build | approximate | no          | no      | yes         |
| **Capture** (experimental) | not available in a release              | yes         | read-only   | no      | no          |

## Tier 0: the plugin

The full tool, and what the rest of these docs describe. The app's own dev server instruments every
component through Svelte's public API (see [Architecture](architecture.md)), so you get the tree, every
value, editing, history, highlight and the element picker.

**How to get it:** add `runespectPreprocess()` and `runespect()` to the app's Vite config, as in
[Getting started](../tutorials/getting-started.md), and run the dev server. Then use any of the three panels: the window at
`/__runespect/`, the `<Inspect>` overlay, or the extension's DevTools tab.

**Limits:**

- Dev server only. `vite build` does not run the plugin, and a production build carries none of
  it.
- Only values declared at the top of a component's script, or of a `.svelte.ts` module, are shown.
  Components from `node_modules` are not instrumented.

## Tier 1: the extension on an app without the plugin

The chip says **Tier 1**: component names only.

When a page has Svelte components but no plugin, the extension builds a tree from the page itself.
Svelte adds a `__svelte_meta` property with the source file and line to elements in a dev build; the
extension reads it (`packages/extension/src/dom-walk.ts`) and groups the elements by the component
file that rendered them.

**How to get it:** install the extension and open the runespect tab in DevTools on a page served by
a Svelte dev server. Nothing to change in the app.

**Limits:**

- **No values, no editing, no highlight and no picker.** Svelte's state is not reachable from the
  DOM.
- **The tree is approximate.** Nesting is taken from the DOM. All instances of one component file
  are shown as one node, and a component that renders no elements of its own does not appear.
- **Dev builds only.** A production build has no `__svelte_meta`, so the extension shows nothing.
- **Extension only.** The panel window and the overlay come with the plugin, so they are always
  Tier 0.
- The panel waits two seconds before it shows the Tier 1 chip, so a slow page with the plugin does
  not flash it. A page with the plugin sets `window.__runespect_tier0`, and the extension's DOM walk
  then stays quiet.

To get values and editing, add the plugin to the app.

## Capture (experimental, not released)

The chip says **Experimental**, or **Capture stopped** with the reason.

Capture reads values from an app without the plugin by intercepting Svelte's private runtime while
the app loads. The code is in this repository, with tests, but **no released package or extension
runs it**: `proxy` and `prod-reader` are not published, and the extension does not include them.

- `packages/proxy`, for a **dev build**: redirects the compiled components' `svelte/internal/client`
  import to a wrapper that records each component and each `state` and `derived` it creates, and
  rebuilds the tree from that record.
- `packages/prod-reader`, for a **production build**: finds Svelte's runtime in the minified bundle
  by how its functions are used, wraps it the same way, and rebuilds the tree from the bundle's
  structure. Without a sourcemap, components keep their minified names.

**Limits:**

- **Read-only.** A captured tree offers no edits.
- **Can break on any Svelte release.** It depends on the private runtime, so values can be missing
  or misnamed. When the runtime does not have the shape capture expects, it stops and the chip says
  **Capture stopped**.

If you see the **Experimental** chip, the page is running one of these experiments, not the plugin.

## If the chip says something else

- **Connecting…**: no page has answered yet.
- **No app**: no page answered within two seconds. See
  [Troubleshoot](../how-to/troubleshoot.md#nothing-at-all-in-the-panel).
- **Protocol mismatch**: the page and the panel are different runespect versions. Rebuild or reload
  the extension.
