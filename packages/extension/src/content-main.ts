import { startTier1 } from './content-tier1.js';

// Runs in the page's MAIN world (manifest `world: "MAIN"`) so it can read `__svelte_meta` — a
// main-world property that's invisible to the isolated content script. It broadcasts the
// DOM-derived component tree (Names only) in the format the plugin posts; the isolated
// content.ts relay forwards it to the panel. No-op on pages without `__svelte_meta` (it only posts
// when components are found), so it costs nothing on non-Svelte / production tabs. It needs no extra
// permissions and coexists with the user's open DevTools.
startTier1(window);
