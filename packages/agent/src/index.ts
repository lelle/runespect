// What a user of the agent reads is window.__runespect: the tree, values, history and edits, and
// the event timeline every hop records.
// The runtime the injected code and the plugin call is in `@runespect/agent/internal`, which is
// released in lockstep with @runespect/vite-plugin.
export type { RunespectSurface, ComponentSummary } from './internal.svelte.js';
export type { RunespectEvent } from './protocol/index';
