# Add the in-page overlay

`<Inspect>` shows the tree inside the page itself, in a panel docked to the side. It reads the agent
in the same page directly, so it needs no second window and no extension.

Install `@runespect/ui` next to the plugin:

```sh
npm install --save-dev @runespect/ui
```

and mount the overlay where your app starts:

```ts
import { mount } from 'svelte';

if (import.meta.env.DEV) {
  import('@runespect/ui').then(({ Inspect }) => mount(Inspect, { target: document.body }));
}
```

Keep the `import.meta.env.DEV` guard. The plugin and the preprocessor switch themselves off in a
production build, but a `mount` you write yourself does not: without the guard, the overlay and the
agent ship to production with an empty tree.

The overlay renders inside its own shadow root, so your app's CSS does not reach it, and its
settings (theme, filters, pane sizes) are kept in your app's own `localStorage`.
