# @runespect/ui

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
