# Use with SvelteKit

Install the plugin as in [Getting started](../tutorials/getting-started.md#1-install-the-plugin),
then add the preprocessor and the plugin where your SvelteKit version reads them. Put `runespect()`
after `sveltekit()`; that is the order the tests cover.

## SvelteKit 3

SvelteKit 3 takes the preprocessors in the Vite config:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespect, runespectPreprocess } from '@runespect/vite-plugin';

export default defineConfig({
  plugins: [sveltekit({ preprocess: [vitePreprocess(), runespectPreprocess()] }), runespect()],
});
```

## SvelteKit 2

SvelteKit 2 reads the preprocessors from `svelte.config.js`:

```js
// svelte.config.js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { runespectPreprocess } from '@runespect/vite-plugin';

export default { preprocess: [vitePreprocess(), runespectPreprocess()] };
```

and the plugins from the Vite config:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { runespect } from '@runespect/vite-plugin';

export default defineConfig({ plugins: [sveltekit(), runespect()] });
```

## What is instrumented

Route files are named after their route in the tree, as in `+page (blog/[slug])`. SvelteKit's own
generated root component and everything under `.svelte-kit` are left alone. The agent loads through
SvelteKit's generated client entry, so there is nothing to add to `app.html` or a layout.

Then open the panel: [Open the panel window](open-the-panel-window.md).
