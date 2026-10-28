import { test, expect } from 'vitest';
import { compile } from 'svelte/compiler';
import { runespectPreprocess } from '@runespect/vite-plugin';

const pp = runespectPreprocess({ enabled: true });

// Every component here compiles on its own; instrumenting it must never change that.
const corpus: Record<string, string> = {
  'let state': `<script>\n  let count = $state(0);\n</script>\n<p>{count}</p>`,
  'const state': `<script>\n  const items = $state([]);\n</script>\n<p>{items.length}</p>`,
  'const raw state': `<script>\n  const box = $state.raw({ n: 1 });\n</script>\n<p>{box.n}</p>`,
  'props and bindable': `<script>\n  let { a = 1, b = $bindable(2) } = $props();\n</script>\n<p>{a}{b}</p>`,
  'const bindable': `<script>\n  const { v = $bindable(0) } = $props();\n</script>\n<p>{v}</p>`,
  'class fields': `<script>\n  class Box { value = $state(0); double = $derived(this.value * 2); }\n  const box = new Box();\n</script>\n<p>{box.double}</p>`,
  'no script': `<p>static</p>`,
  'module script only': `<script module>\n  export const x = 1;\n</script>\n<p>{x}</p>`,
  typescript: `<script lang="ts">\n  let n: number = $state(0);\n</script>\n<p>{n}</p>`,
  'dollar property key': `<script>\n  const q = $state({ $in: [1, 2] });\n</script>\n<p>{q.$in.length}</p>`,
  'dollar member call': `<script>\n  let el = $state(null);\n  function stop() { el?.$destroy?.(); }\n</script>\n<button onclick={stop}>x</button>`,
  'dollar type member': `<script lang="ts">\n  type S = { $schema: string };\n  let s: S = $state({ $schema: 'x' });\n</script>\n<p>{s.$schema}</p>`,
  'store from props': `<script>\n  let { store } = $props();\n</script>\n<p>{$store}</p>`,
  'legacy with store and reactive statement': `<script>\n  import { writable } from 'svelte/store';\n  export let a = 1;\n  const s = writable(0);\n  $: b = a * 2;\n</script>\n<p>{$s} {b}</p>`,
  'legacy with context': `<script>\n  import { getContext, setContext } from 'svelte';\n  export let label = 'x';\n  const theme = getContext('theme');\n  setContext('k', label);\n</script>\n<p>{theme}</p>`,
  'legacy opted out of runes': `<svelte:options runes={false} />\n<script>\n  import { writable } from 'svelte/store';\n  const s = writable(0);\n</script>\n<p>{$s}</p>`,
  'no runes, no legacy syntax': `<script>\n  import { writable } from 'svelte/store';\n  let n = 0;\n  const s = writable(0);\n</script>\n<button on:click={() => n++}>{n} {$s}</button>`,
  snippet: `<script>\n  let name = $state('a');\n</script>\n{#snippet hi(who)}<b>{who}</b>{/snippet}\n{@render hi(name)}`,
};

for (const [name, source] of Object.entries(corpus)) {
  for (const generate of ['client', 'server'] as const) {
    test(`instrumented component still compiles (${generate}): ${name}`, () => {
      const filename = 'Fixture.svelte';
      compile(source, { filename, generate, dev: true });
      const instrumented = pp.markup({ content: source, filename })?.code ?? source;
      expect(() => compile(instrumented, { filename, generate, dev: true })).not.toThrow();
    });

    // Projects can force runes mode for every component (compilerOptions.runes).
    test(`instrumented component still compiles with runes forced (${generate}): ${name}`, () => {
      const filename = 'Fixture.svelte';
      const options = { filename, generate, dev: true, runes: true } as const;
      try {
        compile(source, options);
      } catch {
        return; // not valid in forced runes mode to begin with
      }
      const instrumented = pp.markup({ content: source, filename })?.code ?? source;
      expect(() => compile(instrumented, options)).not.toThrow();
    });
  }
}
