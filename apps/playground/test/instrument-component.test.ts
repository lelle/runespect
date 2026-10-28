// @vitest-environment node
import { test, expect } from 'vitest';
import path from 'node:path';
import { build, type Rollup } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { instrumentComponent } from '@runespect/vite-plugin/internal';

// The project site's demo is a production build that must still be instrumented, which
// runespectPreprocess() never does. instrumentComponent is the same instrumentation without that
// gate, for a build that asks for it on purpose, with the location the panel shows given by the
// caller so the bundle carries no path from the machine that built it.

const appDir = path.resolve(import.meta.dirname, 'fixtures/production-app');
const counter = `<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
<button>{count} {doubled}</button>`;

test('instruments a component while NODE_ENV is production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const out = instrumentComponent(counter, '/home/someone/app/src/Counter.svelte').code;
    // Instrumented: the code now imports the agent and names the component to it.
    expect(out).toContain('"@runespect/agent/runtime"');
    expect(out).toContain('"Counter"');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test('reports the location it is given instead of the file path', () => {
  const out = instrumentComponent(counter, '/home/someone/app/src/Counter.svelte', {
    loc: 'src/Counter.svelte',
  }).code;
  expect(out).toContain('loc: "src/Counter.svelte"');
  expect(out).not.toContain('/home/someone');
});

test('a production build that asks for it ships the instrumentation and no source paths', async () => {
  const output = (await build({
    configFile: false,
    root: appDir,
    logLevel: 'silent',
    plugins: [
      svelte({
        preprocess: {
          name: 'demo',
          markup: ({ content, filename }) =>
            instrumentComponent(content, filename!, {
              loc: path.relative(appDir, filename!),
            }),
        },
      }),
    ],
    build: { write: false, rollupOptions: { input: path.join(appDir, 'main.js') } },
  })) as Rollup.RollupOutput;
  const bundle = output.output.map((file) => ('code' in file ? file.code : '')).join('\n');

  expect(bundle).toContain('Counter.svelte');
  expect(bundle).toMatch(/Symbol\.for\(["'`]runespect["'`]\)/);
  expect(bundle.includes(appDir)).toBe(false);
}, 60_000);
