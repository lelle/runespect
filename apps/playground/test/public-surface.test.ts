import { test, expect } from 'vitest';
import * as protocol from '@runespect/agent/protocol';
import * as agent from '@runespect/agent';
import * as ui from '@runespect/ui';
import * as vitePlugin from '@runespect/vite-plugin';

// What a package's main entry exports is what it promises to keep. Everything the repository's own
// packages and tests need beyond that lives in `<package>/internal`, which is not documented.
test('@runespect/agent/protocol exports only types and the protocol version', () => {
  expect(Object.keys(protocol).sort()).toEqual(['PROTOCOL_VERSION']);
});

// The agent's runtime is called by the code the preprocessor injects, and by the plugin, both
// through `@runespect/agent/internal`. What a user reads is window.__runespect, so only its types
// are promised.
test('@runespect/agent exports only types', () => {
  expect(Object.keys(agent)).toEqual([]);
});

// The panel is mounted by the extension and the plugin's panel window, both in this repository.
test('@runespect/ui exports only the in-page overlay', () => {
  expect(Object.keys(ui)).toEqual(['Inspect']);
});

test('@runespect/vite-plugin exports the plugin and the preprocessor', () => {
  expect(Object.keys(vitePlugin).sort()).toEqual(['runespect', 'runespectPreprocess']);
});
