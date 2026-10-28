import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

// Flat config. Pragmatic baseline: recommended JS + TS + Svelte rules, without the
// type-checked tier (faster, fewer false positives). `no-explicit-any` is off — the AST
// walkers in the preprocessor and reconstruct logic deliberately use `any`.
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      // Built output: the standalone panel bundle the vite-plugin serves at /__runespect/.
      '**/panel-dist/**',
      // Built output: the project site, for GitHub Pages.
      'site/**',
      '**/node_modules/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/fixtures/**',
      '**/.fixtures/**',
      '**/*.d.ts',
      'pnpm-lock.yaml',
      'apps/sveltekit-spa/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Keyless {#each} is acceptable in playground fixtures; surface it, don't block.
      'svelte/require-each-key': 'warn',
      // Advisory, not a blocker: reactive state uses SvelteMap/SvelteSet, but plenty of Map/Set
      // here is deliberate plumbing. See the agent override below.
      'svelte/prefer-svelte-reactivity': 'warn',
    },
  },
  {
    // Svelte components AND rune modules (*.svelte.ts/.js) parse via svelte-eslint-parser,
    // which needs the TS parser wired in to read TypeScript syntax.
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    // The proxy is the experimental capture path: reading svelte/internal is its purpose, and its
    // tests run the recording against the real internals.
    files: ['packages/proxy/**', 'apps/playground/test/capture-dev.test.ts'],
    rules: { 'svelte/no-svelte-internal': 'off' },
  },
  {
    // The agent's Maps/Sets are never rendered: `binders` holds setters, and dehydrate()/connect()
    // build the values that go over the transport. A reactive proxy there would be a bug, not an
    // improvement.
    files: ['packages/agent/src/**/*.ts'],
    rules: { 'svelte/prefer-svelte-reactivity': 'off' },
  },
);
