# Use the browser extension

The extension shows the same panel as a **runespect** tab in Chrome DevTools, fed through the
extension instead of the dev server. It needs Chrome 111 or newer, or another Chromium-based
browser.

## Install it from source

Build the extension from a clone of the repository:

```sh
pnpm install
pnpm --filter @runespect/extension build     # → packages/extension/dist/
```

In Chrome: `chrome://extensions` → Developer mode → Load unpacked → `packages/extension/dist/`.

## Open the tab

Open a page of a Svelte app in development, open DevTools, and pick the **runespect** tab. What the
tab shows depends on the page:

- **The app uses the plugin:** the full panel, the same as the panel window. The status chip says
  **Live**.
- **The app does not use the plugin:** on a development build of Svelte 5, the component tree and
  the file each component comes from, read from the page's elements. There are no values and no
  editing, and the chip says **Names only**. [What the panel can show](../explanation/tiers.md) has what each can
  show.

## After rebuilding the extension

Press ↻ on the extension in `chrome://extensions`, then reload the page. A panel that was open
during the reload stops updating; close and reopen DevTools.

## What it asks for

The extension asks for no API permissions: its
[`manifest.json`](../../packages/extension/manifest.json) has no `permissions`,
`optional_permissions` or `host_permissions`. It sends nothing anywhere; see
[`PRIVACY.md`](../../PRIVACY.md).

It runs two content scripts on every page (`<all_urls>`), because a development server can run at
any address: `localhost`, a LAN address, or a staging host.

| Script                | Runs in                            | Why                                                                                                                       |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/content.ts`      | isolated world, `document_start`   | Passes runespect's own messages between the page and the DevTools tab, and ignores all others.                            |
| `src/content-main.ts` | page's main world, `document_idle` | Reads the component names and source locations Svelte attaches to elements in a dev build; only the main world sees them. |

On a page without a Svelte development build they find nothing and post nothing.

## Limits

- Chrome and Chromium-based browsers only (Manifest V3).
- Without the plugin it shows no values. On a production build it shows nothing at all, because the bundle
  carries no component information, unless it was built with
  [`includeInRelease`](../reference/options.md#includeinrelease).
