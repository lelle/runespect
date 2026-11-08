# @runespect/ui

## 0.3.0

### Minor Changes

- [#45](https://github.com/lelle/runespect/pull/45) [`612ccdd`](https://github.com/lelle/runespect/commit/612ccddb88dcff4545827f0492aacf9ab0967c93) Thanks [@lelle](https://github.com/lelle)! - Open in editor works with any editor: it asks the dev server to open the file through Vite's `/__open-in-editor`, which opens the editor `LAUNCH_EDITOR` or `EDITOR` names, so WebStorm, Rider, Zed and others work as well as VS Code. A notice says so for 3 seconds, and where to look if nothing opens. `runespect({ openInEditor: 'vscode' })` keeps the `vscode://` links, for a dev server on another machine.

### Patch Changes

- [#35](https://github.com/lelle/runespect/pull/35) [`9539987`](https://github.com/lelle/runespect/commit/95399878cb4581ca46cc497220cf88d0288b1b1b) Thanks [@lelle](https://github.com/lelle)! - Highlight a component that renders no element of its own with a dashed box around what its children render, named `Name (via children)`, instead of drawing nothing.

- [#40](https://github.com/lelle/runespect/pull/40) [`1e0e03d`](https://github.com/lelle/runespect/commit/1e0e03dda9583ab050076c4461585d02e032169c) Thanks [@lelle](https://github.com/lelle)! - Every message a page sends carries a number, one more than the last. A panel that hears a number skipped knows a message was lost on the way: it records a `gap` (in the extension's event log; the panel window warns once per page in its own console), and asks the page it follows for its tree and history again, so what it shows matches the page.

- [#54](https://github.com/lelle/runespect/pull/54) [`8417432`](https://github.com/lelle/runespect/commit/84174323ba071bf65c4fa45b47991250b387466a) Thanks [@lelle](https://github.com/lelle)! - The in-page overlay shows values one component at a time: a click on a component's name, or on (+) and (−), opens and closes its values in place, and all start closed, so a large page's tree stays readable. Open in editor is a </> beside the name, as in the panel. ⚙ → **Values** → **Beside the tree** shows names only, with the selected component's values below a divider you can drag. Selecting, picking or searching to a component opens it. The heading and filter stay put while the tree scrolls, scrolling over the overlay no longer scrolls the page behind it, and the ⚙ menu shows whole over a short overlay. A names-only tree, in the overlay or the panel, says on a line below it which keys move in it. The detail pane follows ⚙ → **Flash on update**, in the panel too.

- [#44](https://github.com/lelle/runespect/pull/44) [`9755820`](https://github.com/lelle/runespect/commit/9755820339ade5a8dc99e2666cadc6b06a65e7c9) Thanks [@lelle](https://github.com/lelle)! - The panel keeps to its tab across a reload, and drops tabs that are gone: a closed tab leaves the list, and a reloaded one stays one row. Another tab opening, or one saying hello again, no longer takes the panel from the page it follows. With no url to follow, it takes a tab that is shown over one in the background. The chip says `· 3 pages`. A page asked for its tree that does not send it in time is asked again.

- [#36](https://github.com/lelle/runespect/pull/36) [`91cb58a`](https://github.com/lelle/runespect/commit/91cb58a02e9cec297063a95374d2d9e77d1b6bff) Thanks [@lelle](https://github.com/lelle)! - The panel says how many pages it hears (`/checkout · 3 pages heard ▾`), and its list shows each page's url, when it last spoke, its title, tier and agent version. A page that navigates on the client says hello again, so it is listed under its new url and title.
- Updated dependencies [[`9539987`](https://github.com/lelle/runespect/commit/95399878cb4581ca46cc497220cf88d0288b1b1b), [`1e0e03d`](https://github.com/lelle/runespect/commit/1e0e03dda9583ab050076c4461585d02e032169c), [`612ccdd`](https://github.com/lelle/runespect/commit/612ccddb88dcff4545827f0492aacf9ab0967c93), [`d483abc`](https://github.com/lelle/runespect/commit/d483abc568325586d627a31d26b98e3f99ade8d9), [`91cb58a`](https://github.com/lelle/runespect/commit/91cb58a02e9cec297063a95374d2d9e77d1b6bff), [`f1cf34f`](https://github.com/lelle/runespect/commit/f1cf34f2461cbd51fd493d19f5ae6624f5c82873), [`65e243a`](https://github.com/lelle/runespect/commit/65e243ad2028d6bd2a18d64a88df4a9b398dc6fd)]:
  - @runespect/agent@0.3.0

## 0.2.0

### Minor Changes

- [#20](https://github.com/lelle/runespect/pull/20) [`3df6bef`](https://github.com/lelle/runespect/commit/3df6befe1de9642336f8cb7a557101f83c678430) Thanks [@lelle](https://github.com/lelle)! - Add `includeInRelease` to `runespect()`: builds runespect into the code `vite build` produces, for a dev or test environment without a dev server.

- [#22](https://github.com/lelle/runespect/pull/22) [`4fa95bc`](https://github.com/lelle/runespect/commit/4fa95bce9621883808af423e8dea73102a842d69) Thanks [@lelle](https://github.com/lelle)! - Add `panelInRelease` to `runespect()`: `false` leaves the panel window out of an `includeInRelease` build, for those who use only the extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`fa102c1`](https://github.com/lelle/runespect/commit/fa102c194813ecfd50c07138b042b6e5961a0d98) Thanks [@lelle](https://github.com/lelle)! - `includeInRelease` now also puts the panel window in the build, at `/__runespect/`. It needs no dev server and no extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf) Thanks [@lelle](https://github.com/lelle)! - The panel's status says what it shows: Tier 0 is now Live, and Tier 1 is Names only, with a link to add the plugin.

### Patch Changes

- [#22](https://github.com/lelle/runespect/pull/22) [`4b5d63e`](https://github.com/lelle/runespect/commit/4b5d63ef5700f7a4368da88f54dab5d50623b331) Thanks [@lelle](https://github.com/lelle)! - Names only no longer offers Open in editor, which could not open the file: it only knows a path relative to the project.
- Updated dependencies [[`3df6bef`](https://github.com/lelle/runespect/commit/3df6befe1de9642336f8cb7a557101f83c678430), [`4fa95bc`](https://github.com/lelle/runespect/commit/4fa95bce9621883808af423e8dea73102a842d69), [`fa102c1`](https://github.com/lelle/runespect/commit/fa102c194813ecfd50c07138b042b6e5961a0d98), [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf)]:
  - @runespect/agent@0.2.0

## 0.1.2

### Patch Changes

- [#13](https://github.com/lelle/runespect/pull/13) [`bb0bca1`](https://github.com/lelle/runespect/commit/bb0bca16af374feaf5bf609a35105e00de5883f0) Thanks [@lelle](https://github.com/lelle)! - A value that changes again flashes again. The blink used to run only once until it ended, and a
  value changing all the time showed nothing.

- [#14](https://github.com/lelle/runespect/pull/14) [`204e25c`](https://github.com/lelle/runespect/commit/204e25c0a7d5a34f55e0be8a9a2aa9d88978feff) Thanks [@lelle](https://github.com/lelle)! - A selected component in the tree has a whole, rounded frame that pulses gently. The frame used to
  lose its top and bottom. A flash has the same shape.

- [#13](https://github.com/lelle/runespect/pull/13) [`0da84a8`](https://github.com/lelle/runespect/commit/0da84a87c43a053860886e95935c4a77f0945f5b) Thanks [@lelle](https://github.com/lelle)! - The settings button in the panel lines up with the rest of the toolbar.

- [#14](https://github.com/lelle/runespect/pull/14) [`32b32df`](https://github.com/lelle/runespect/commit/32b32df8a0871adc48d63a1fc35808254b5ac90a) Thanks [@lelle](https://github.com/lelle)! - The state filter moves from the toolbar to the settings menu. While it is on, a line above the tree
  says so, and its × turns it off.
- Updated dependencies []:
  - @runespect/agent@0.1.2

## 0.1.1

### Patch Changes

- [#6](https://github.com/lelle/runespect/pull/6) [`6580267`](https://github.com/lelle/runespect/commit/6580267adfa86ce4b1d7b70ce1f3e902ea7635da) Thanks [@lelle](https://github.com/lelle)! - While picking, the box covers the instance a click picks, not the element under the pointer, and
  nothing where a click would pick nothing. The box carries the component's name, also when a row in
  the tree is hovered.

- [#7](https://github.com/lelle/runespect/pull/7) [`7ae2f1e`](https://github.com/lelle/runespect/commit/7ae2f1e4e1bbfa20693a2e855eeceb25da368883) Thanks [@lelle](https://github.com/lelle)! - Say so when `@runespect/ui` and `@runespect/vite-plugin` are not the same version. The overlay runs
  on the plugin's agent, and another version may lack what it calls: the dev server now warns in the
  terminal, and the overlay shows a notice instead of the tree, also next to an agent from 0.1.0.
- Updated dependencies [[`80755eb`](https://github.com/lelle/runespect/commit/80755ebf0e6c6cf5f74c36f9ebc939852415d091), [`6580267`](https://github.com/lelle/runespect/commit/6580267adfa86ce4b1d7b70ce1f3e902ea7635da), [`7ae2f1e`](https://github.com/lelle/runespect/commit/7ae2f1e4e1bbfa20693a2e855eeceb25da368883)]:
  - @runespect/agent@0.1.1

## 0.1.0

First release.
