import { test, expect } from 'vitest';
import { rewriteSvelteInternalImport, importsSvelteInternal } from '../src/rewrite.js';

test('rewrites the bare svelte/internal/client specifier to the wrapper url', () => {
  const code = `import * as $ from "svelte/internal/client";\n$.state(0);`;
  const out = rewriteSvelteInternalImport(code, '/__rs/internal');
  expect(out).toContain('import * as $ from "/__rs/internal"');
  expect(out).not.toContain('svelte/internal/client');
});

test("rewrites Vite's resolved optimised-dep url form too", () => {
  const code = `import * as $ from "/node_modules/.vite/deps/svelte_internal_client.js?v=abc";`;
  const out = rewriteSvelteInternalImport(code, '/__rs/internal?o=abc');
  expect(out).toContain('"/__rs/internal?o=abc"');
  expect(importsSvelteInternal(out)).toBe(false);
});

test('leaves unrelated imports untouched', () => {
  const code = `import { mount } from "svelte";\nimport x from "./util.js";`;
  expect(rewriteSvelteInternalImport(code, '/__rs/internal')).toBe(code);
});
