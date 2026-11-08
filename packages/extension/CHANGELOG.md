# @runespect/extension

## 0.3.1

### Patch Changes

- [#59](https://github.com/lelle/runespect/pull/59) [`1ccdb91`](https://github.com/lelle/runespect/commit/1ccdb91a0e65501031eb3b4378017abf7a0283d0) Thanks [@lelle](https://github.com/lelle)! - The extension's website link, on Chrome's extensions page, goes to the runespect site with its docs and demo instead of the GitHub repository.

## 0.3.0

### Minor Changes

- [#45](https://github.com/lelle/runespect/pull/45) [`612ccdd`](https://github.com/lelle/runespect/commit/612ccddb88dcff4545827f0492aacf9ab0967c93) Thanks [@lelle](https://github.com/lelle)! - Open in editor works with any editor: it asks the dev server to open the file through Vite's `/__open-in-editor`, which opens the editor `LAUNCH_EDITOR` or `EDITOR` names, so WebStorm, Rider, Zed and others work as well as VS Code. A notice says so for 3 seconds, and where to look if nothing opens. `runespect({ openInEditor: 'vscode' })` keeps the `vscode://` links, for a dev server on another machine.

### Patch Changes

- [#56](https://github.com/lelle/runespect/pull/56) [`f9b1e9c`](https://github.com/lelle/runespect/commit/f9b1e9c5b2d39b27bb708d26a56d835222d87c85) Thanks [@lelle](https://github.com/lelle)! - The extension's icon has a thin dark outline in every size, so it stands out on a light toolbar.

- [#40](https://github.com/lelle/runespect/pull/40) [`1e0e03d`](https://github.com/lelle/runespect/commit/1e0e03dda9583ab050076c4461585d02e032169c) Thanks [@lelle](https://github.com/lelle)! - Every message a page sends carries a number, one more than the last. A panel that hears a number skipped knows a message was lost on the way: it records a `gap` (in the extension's event log; the panel window warns once per page in its own console), and asks the page it follows for its tree and history again, so what it shows matches the page.

- [#53](https://github.com/lelle/runespect/pull/53) [`e1f4471`](https://github.com/lelle/runespect/commit/e1f44711bd74f7d7dcf15ef469d3246f47ef142d) Thanks [@lelle](https://github.com/lelle)! - Stop the Names only walk at 10,000 components, so a page where components all hold each other cannot hang the tab.

- [#44](https://github.com/lelle/runespect/pull/44) [`9755820`](https://github.com/lelle/runespect/commit/9755820339ade5a8dc99e2666cadc6b06a65e7c9) Thanks [@lelle](https://github.com/lelle)! - The panel keeps to its tab across a reload, and drops tabs that are gone: a closed tab leaves the list, and a reloaded one stays one row. Another tab opening, or one saying hello again, no longer takes the panel from the page it follows. With no url to follow, it takes a tab that is shown over one in the background. The chip says `· 3 pages`. A page asked for its tree that does not send it in time is asked again.

## 0.2.0

### Minor Changes

- [#22](https://github.com/lelle/runespect/pull/22) [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf) Thanks [@lelle](https://github.com/lelle)! - The panel's status says what it shows: Tier 0 is now Live, and Tier 1 is Names only, with a link to add the plugin.

### Patch Changes

- [#22](https://github.com/lelle/runespect/pull/22) [`4b5d63e`](https://github.com/lelle/runespect/commit/4b5d63ef5700f7a4368da88f54dab5d50623b331) Thanks [@lelle](https://github.com/lelle)! - Names only no longer offers Open in editor, which could not open the file: it only knows a path relative to the project.

- [#22](https://github.com/lelle/runespect/pull/22) [`db02298`](https://github.com/lelle/runespect/commit/db022983172057a8656eb57fa21f7742396f5534) Thanks [@lelle](https://github.com/lelle)! - Names only no longer shows an empty tree on an app that passes markup to a child as a snippet.

- [#23](https://github.com/lelle/runespect/pull/23) [`9e2a985`](https://github.com/lelle/runespect/commit/9e2a9853abc08c66905128897e341a7082a007ac) Thanks [@lelle](https://github.com/lelle)! - The extension is now called "runespect: Svelte 5 DevTools", so it says what it is.

## 0.1.1

### Patch Changes

- [#16](https://github.com/lelle/runespect/pull/16) [`34d3dd5`](https://github.com/lelle/runespect/commit/34d3dd54a84b0efc9ccf0cf460dbd5ced98978fd) Thanks [@lelle](https://github.com/lelle)! - Brings the panel up to date with 0.1.2 of the packages: a value that changes again flashes again, the settings button lines up with the toolbar, the state filter moves to the settings menu, and a selected component has a whole, rounded frame that pulses gently.
