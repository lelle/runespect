import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Shared Svelte config (used by svelte-check for type-checking .svelte files).
// vitePreprocess handles `lang="ts"` in component scripts.
export default {
  preprocess: vitePreprocess(),
};
