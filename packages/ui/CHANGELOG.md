# @runespect/ui

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
