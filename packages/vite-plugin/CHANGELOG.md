# @runespect/vite-plugin

## 0.2.0

### Minor Changes

- [#20](https://github.com/lelle/runespect/pull/20) [`3df6bef`](https://github.com/lelle/runespect/commit/3df6befe1de9642336f8cb7a557101f83c678430) Thanks [@lelle](https://github.com/lelle)! - Add `includeInRelease` to `runespect()`: builds runespect into the code `vite build` produces, for a dev or test environment without a dev server.

- [#22](https://github.com/lelle/runespect/pull/22) [`4fa95bc`](https://github.com/lelle/runespect/commit/4fa95bce9621883808af423e8dea73102a842d69) Thanks [@lelle](https://github.com/lelle)! - Add `panelInRelease` to `runespect()`: `false` leaves the panel window out of an `includeInRelease` build, for those who use only the extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`fa102c1`](https://github.com/lelle/runespect/commit/fa102c194813ecfd50c07138b042b6e5961a0d98) Thanks [@lelle](https://github.com/lelle)! - `includeInRelease` now also puts the panel window in the build, at `/__runespect/`. It needs no dev server and no extension.

- [#22](https://github.com/lelle/runespect/pull/22) [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf) Thanks [@lelle](https://github.com/lelle)! - The panel's status says what it shows: Tier 0 is now Live, and Tier 1 is Names only, with a link to add the plugin.

### Patch Changes

- Updated dependencies [[`3df6bef`](https://github.com/lelle/runespect/commit/3df6befe1de9642336f8cb7a557101f83c678430), [`4fa95bc`](https://github.com/lelle/runespect/commit/4fa95bce9621883808af423e8dea73102a842d69), [`fa102c1`](https://github.com/lelle/runespect/commit/fa102c194813ecfd50c07138b042b6e5961a0d98), [`100cd5a`](https://github.com/lelle/runespect/commit/100cd5a74d00d4c69f66390f5234bbd667ad13bf)]:
  - @runespect/agent@0.2.0

## 0.1.2

### Patch Changes

- [#11](https://github.com/lelle/runespect/pull/11) [`704310e`](https://github.com/lelle/runespect/commit/704310ec1c1824b014072df5f72538fbeedd7e60) Thanks [@lelle](https://github.com/lelle)! - The page loads one agent, the plugin's, also when the app's `@runespect/ui` is another version and
  the package manager installed a second agent next to it. Vite's own resolver used to hand that
  second agent to the overlay, which then showed an empty tree; now the overlay gets the plugin's
  agent, and shows its version notice when the two do not match.
- Updated dependencies []:
  - @runespect/agent@0.1.2

## 0.1.1

### Patch Changes

- [#4](https://github.com/lelle/runespect/pull/4) [`80755eb`](https://github.com/lelle/runespect/commit/80755ebf0e6c6cf5f74c36f9ebc939852415d091) Thanks [@lelle](https://github.com/lelle)! - Highlight and pick the instance you point at, also in a list. A component that renders several
  elements side by side marked the elements of its first instance, and after rows left a list and came
  back, a row could mark another row. The plugin now tells the agent which instance renders each
  element, instead of the agent guessing from the order of files and elements in the page, and the
  highlight covers all of an instance's elements, not only its first.

- [#7](https://github.com/lelle/runespect/pull/7) [`7ae2f1e`](https://github.com/lelle/runespect/commit/7ae2f1e4e1bbfa20693a2e855eeceb25da368883) Thanks [@lelle](https://github.com/lelle)! - Say so when `@runespect/ui` and `@runespect/vite-plugin` are not the same version. The overlay runs
  on the plugin's agent, and another version may lack what it calls: the dev server now warns in the
  terminal, and the overlay shows a notice instead of the tree, also next to an agent from 0.1.0.
- Updated dependencies [[`80755eb`](https://github.com/lelle/runespect/commit/80755ebf0e6c6cf5f74c36f9ebc939852415d091), [`6580267`](https://github.com/lelle/runespect/commit/6580267adfa86ce4b1d7b70ce1f3e902ea7635da), [`7ae2f1e`](https://github.com/lelle/runespect/commit/7ae2f1e4e1bbfa20693a2e855eeceb25da368883)]:
  - @runespect/agent@0.1.1

## 0.1.0

First release.
