import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { runespect, runespectPreprocess } from '@runespect/vite-plugin';

// SPA build: adapter-static with a fallback page renders the whole app on the client.
export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: [vitePreprocess(), runespectPreprocess()],
      adapter: adapter({ fallback: 'index.html' }),
    }),
    // The build e2e/include-in-release.spec.ts drives.
    runespect({ includeInRelease: process.env.DEPLOY_ENV === 'test' }),
  ],
  server: { port: 5181 },
  build: { sourcemap: true },
});
