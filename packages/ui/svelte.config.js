import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Read by svelte-package only. The shipped scripts lose their types, so an app's own Svelte never
// has to strip them (Svelte 5.40-5.50 cannot strip optional parameters).
export default {
  preprocess: vitePreprocess({ script: true }),
};
