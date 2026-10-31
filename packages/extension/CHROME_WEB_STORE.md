# Chrome Web Store listing

What to enter in the Chrome Web Store developer dashboard for this extension. Change it together with
what it describes.

## Store listing

- **Name:** runespect: Svelte 5 DevTools (from `packages/extension/manifest.json`)
- **Summary** (132 characters at most):
  Svelte 5 devtools: inspect the component tree and live $state, $derived and $props, edit values,
  and see what changed.
- **Category:** Developer Tools
- **Language:** English
- **Icon:** `public/icons/icon-128.png`
- **Screenshots** (1280×800): `panel-tree.png`, `panel-history.png`, `overlay.png`
- **Homepage:** https://github.com/lelle/runespect
- **Support:** https://github.com/lelle/runespect/issues

### Description

Svelte 5 DevTools: runespect adds a tab to Chrome DevTools that shows the component tree of your
Svelte 5 app. Works right away on any development build. Add the runespect Vite plugin to see and
edit live $state, $derived and $props.

With the runespect Vite plugin in your app's development build, the tab shows:

- the component tree, and every component's props, state, derived values, stores and context
- state kept in .svelte.ts modules
- editing of $state and $bindable values, nested fields included
- the history of what changed, flush by flush, with values before and after
- an element picker, highlight on hover, and open in editor

Without the plugin, on any development build of a Svelte 5 app, the tab still shows the
component tree, without values.

The same panel also runs without the extension: the plugin serves it at /__runespect/ on your
development server, and as an overlay inside the page.

runespect is open source (MIT). It is for development and test builds, not production. It sends
nothing anywhere.

## Privacy practices

- **Single purpose:** Inspect and edit the components and state of a Svelte app under development,
  in a Chrome DevTools panel.
- **Permission justification, host access (content scripts on all sites):** A development server can
  run at any address (localhost, a LAN address, a staging host). The content scripts pass the app's
  own devtools messages to the DevTools panel and read the component names Svelte adds to elements in
  development builds. They find nothing, and do nothing, on other pages.
- **Remote code:** No.
- **Data usage:** The extension collects no user data. Check none of the data types. Certify the
  three statements (no selling, no use unrelated to the single purpose, no use for credit).
- **Privacy policy URL:** https://github.com/lelle/runespect/blob/main/PRIVACY.md

## Before submitting

- The repository is public, so the homepage, support and privacy policy links resolve.
- `pnpm --filter @runespect/extension build`, then zip the contents of `packages/extension/dist/`.
- The version in `packages/extension/package.json` is the version being released.
