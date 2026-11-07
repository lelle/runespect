# @runespect/agent

## 0.2.1

### Patch Changes

- [#35](https://github.com/lelle/runespect/pull/35) [`9539987`](https://github.com/lelle/runespect/commit/95399878cb4581ca46cc497220cf88d0288b1b1b) Thanks [@lelle](https://github.com/lelle)! - Highlight a component that renders no element of its own with a dashed box around what its children render, named `Name (via children)`, instead of drawing nothing.

- [#40](https://github.com/lelle/runespect/pull/40) [`1e0e03d`](https://github.com/lelle/runespect/commit/1e0e03dda9583ab050076c4461585d02e032169c) Thanks [@lelle](https://github.com/lelle)! - Every message a page sends carries a number, one more than the last. A panel that hears a number skipped knows a message was lost on the way: it records a `gap` (in the extension's event log; the panel window warns once per page in its own console), and asks the page it follows for its tree and history again, so what it shows matches the page.

- [#45](https://github.com/lelle/runespect/pull/45) [`612ccdd`](https://github.com/lelle/runespect/commit/612ccddb88dcff4545827f0492aacf9ab0967c93) Thanks [@lelle](https://github.com/lelle)! - Open in editor works with any editor: it asks the dev server to open the file through Vite's `/__open-in-editor`, which opens the editor `LAUNCH_EDITOR` or `EDITOR` names, so WebStorm, Rider, Zed and others work as well as VS Code. A notice says so for 3 seconds, and where to look if nothing opens. `runespect({ openInEditor: 'vscode' })` keeps the `vscode://` links, for a dev server on another machine.

- [#43](https://github.com/lelle/runespect/pull/43) [`d483abc`](https://github.com/lelle/runespect/commit/d483abc568325586d627a31d26b98e3f99ade8d9) Thanks [@lelle](https://github.com/lelle)! - A page a panel has spoken to keeps its id in the tab's `sessionStorage` and says `bye` when it goes. The next page in the tab names it in its hello (`replaces`). A page answers a `ping` with its hello without following, says whether its tab is visible, and says hello again when the tab is shown or hidden. A tab no panel has spoken to writes nothing.

- [#36](https://github.com/lelle/runespect/pull/36) [`91cb58a`](https://github.com/lelle/runespect/commit/91cb58a02e9cec297063a95374d2d9e77d1b6bff) Thanks [@lelle](https://github.com/lelle)! - The panel says how many pages it hears (`/checkout · 3 pages heard ▾`), and its list shows each page's url, when it last spoke, its title, tier and agent version. A page that navigates on the client says hello again, so it is listed under its new url and title.

- [#35](https://github.com/lelle/runespect/pull/35) [`f1cf34f`](https://github.com/lelle/runespect/commit/f1cf34f2461cbd51fd493d19f5ae6624f5c82873) Thanks [@lelle](https://github.com/lelle)! - `__runespect.set()` with a name like `constructor` that the component does not have is refused as `unknown-symbol`, not `not-writable`.

- [#33](https://github.com/lelle/runespect/pull/33) [`65e243a`](https://github.com/lelle/runespect/commit/65e243ad2028d6bd2a18d64a88df4a9b398dc6fd) Thanks [@lelle](https://github.com/lelle)! - `__runespect.set()` says why it did nothing: a console warning with the reason, and a `refused` event in the event log, which a refused edit from the panel now records too. A path to an array index the array does not have, or that is not a whole number, is refused instead of adding a stray property.

## 0.2.0

### Minor Changes

- [#20](https://github.com/lelle/runespect/pull/20) [`3df6bef`](https://github.com/lelle/runespect/commit/3df6befe1de9642336f8cb7a557101f83c678430) Thanks [@lelle](https://github.com/lelle)! - Add `includeInRelease` to `runespect()`: builds runespect into the code `vite build` produces, for a dev or test environment without a dev server.

- [#22](https://github.com/lelle/runespect/pull/22) [`4fa95bc`](https://github.com/lelle/runespect/commit/4fa95bce9621883808af423e8dea73102a842d69) Thanks [@lelle](https://github.com/lelle)! - Add `panelInRelease` to `runespect()`: `false` leaves the panel window out of an `includeInRelease` build, for those who use only the extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`fa102c1`](https://github.com/lelle/runespect/commit/fa102c194813ecfd50c07138b042b6e5961a0d98) Thanks [@lelle](https://github.com/lelle)! - `includeInRelease` now also puts the panel window in the build, at `/__runespect/`. It needs no dev server and no extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf) Thanks [@lelle](https://github.com/lelle)! - The panel's status says what it shows: Tier 0 is now Live, and Tier 1 is Names only, with a link to add the plugin.

## 0.1.2

No changes in this release.

## 0.1.1

### Patch Changes

- [#4](https://github.com/lelle/runespect/pull/4) [`80755eb`](https://github.com/lelle/runespect/commit/80755ebf0e6c6cf5f74c36f9ebc939852415d091) Thanks [@lelle](https://github.com/lelle)! - Highlight and pick the instance you point at, also in a list. A component that renders several
  elements side by side marked the elements of its first instance, and after rows left a list and came
  back, a row could mark another row. The plugin now tells the agent which instance renders each
  element, instead of the agent guessing from the order of files and elements in the page, and the
  highlight covers all of an instance's elements, not only its first.

- [#6](https://github.com/lelle/runespect/pull/6) [`6580267`](https://github.com/lelle/runespect/commit/6580267adfa86ce4b1d7b70ce1f3e902ea7635da) Thanks [@lelle](https://github.com/lelle)! - While picking, the box covers the instance a click picks, not the element under the pointer, and
  nothing where a click would pick nothing. The box carries the component's name, also when a row in
  the tree is hovered.

- [#7](https://github.com/lelle/runespect/pull/7) [`7ae2f1e`](https://github.com/lelle/runespect/commit/7ae2f1e4e1bbfa20693a2e855eeceb25da368883) Thanks [@lelle](https://github.com/lelle)! - Say so when `@runespect/ui` and `@runespect/vite-plugin` are not the same version. The overlay runs
  on the plugin's agent, and another version may lack what it calls: the dev server now warns in the
  terminal, and the overlay shows a notice instead of the tree, also next to an agent from 0.1.0.

## 0.1.0

First release.
