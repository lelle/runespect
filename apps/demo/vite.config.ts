import path from 'node:path';
import { defineConfig } from 'vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { instrumentComponent, instrumentModule } from '@runespect/vite-plugin/internal';

// The demo on the project site: a static build that is instrumented on purpose, which
// runespectPreprocess() and runespect() never are. It is built with `NODE_ENV=development` (.env),
// so Svelte tags each element with its component as it does on a dev server: what the panel's pick
// and highlight read. Locations are kept relative to this package, so the bundle carries
// no path from the machine that built it.
const root = import.meta.dirname;
const inSrc = (id: string) => id.startsWith(path.join(root, 'src') + path.sep);

export default defineConfig({
  base: '/runespect/demo/',
  plugins: [
    svelte({
      preprocess: [
        vitePreprocess(),
        {
          name: 'runespect-demo',
          markup: ({ content, filename }) =>
            filename && inSrc(filename)
              ? instrumentComponent(content, filename, { loc: path.relative(root, filename) })
              : undefined,
        },
      ],
    }),
    {
      name: 'runespect-demo-modules',
      transform(code, id) {
        if (!inSrc(id)) return;
        return instrumentModule(code, path.relative(root, id), (c) => this.parse(c));
      },
    },
  ],
  server: { port: 5182 },
  preview: { port: 5182 },
});
