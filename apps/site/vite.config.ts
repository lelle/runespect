import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The project site, prerendered to site/ at the repository root for GitHub Pages, which serves it
// under /runespect/.
export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ pages: '../../site', assets: '../../site' }),
      // Absolute, because 404.html is served at whatever address was missing.
      paths: { base: '/runespect', relative: false },
      prerender: {
        // The demo is its own build, copied in after this one (copy-demo.ts).
        handleHttpError: ({ path, message }) => {
          if (path.startsWith('/runespect/demo/')) return;
          throw new Error(message);
        },
        handleMissingId: 'fail',
      },
    }),
  ],
  // The docs and the screenshot live at the repository root.
  server: { port: 5183, fs: { allow: ['../..'] } },
});
