# Getting started

In this tutorial you add runespect to a Vite app with Svelte 5, open the panel next to the app, and
change a component's state from the panel. It takes about five minutes.

You need a Svelte 5 app that runs on Vite with `@sveltejs/vite-plugin-svelte`, and Node 20.19 or
newer. On SvelteKit, follow [Use with SvelteKit](../how-to/use-with-sveltekit.md) for the
configuration and come back for step 3.

## 1. Install the plugin

```sh
npm install --save-dev @runespect/vite-plugin
```

It instruments your components while the dev server runs, and brings `@runespect/agent`, the small
runtime in the page that the instrumented code reports to.

## 2. Add the plugin

Add the preprocessor next to your other Svelte preprocessors, and the plugin to Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespect, runespectPreprocess } from '@runespect/vite-plugin';

export default defineConfig({
  plugins: [svelte({ preprocess: [vitePreprocess(), runespectPreprocess()] }), runespect()],
});
```

Both switch themselves off in a production build, so this config is safe to commit.

## 3. Open the panel

Start the dev server as you always do, and open the app. Then open the panel on the same server, in
a second window:

```
app:      http://localhost:5173/
devtools: http://localhost:5173/__runespect/
```

Put the two windows side by side. The panel shows your app's component tree on the left, and its
status chip says **Live**: the plugin is reporting.

## 4. Look at a component

Click a component in the tree. The right-hand side shows its values, grouped by kind: props, state,
derived values, stores and context. Click a button in your app that changes state: the value in the
panel changes with it, and blinks.

## 5. Change a value from the panel

Pick a component with a `$state` value, such as a counter's `count`. Its value in the panel is a
text field. Type a new number. The app updates as you type, and every `$derived` that depends on it
follows.

## 6. See what happened

Open the **History** tab. Each row is one flush of Svelte's updates: what changed, from what, to
what. Your edit is there, next to the changes the app made itself.

## Next

- Keep the tree inside the page instead: [Add the in-page overlay](../how-to/add-the-overlay.md).
- Use Chrome DevTools: [Use the browser extension](../how-to/use-the-extension.md).
- Read the same state from the console or a test: [Console API](../reference/console-api.md).
- Narrow down what is instrumented: [Options](../reference/options.md).
