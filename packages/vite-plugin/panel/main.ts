import { mount } from 'svelte';
import { Panel } from '@runespect/ui/internal';
import { createHotTransport } from '@runespect/agent/internal';
import { viteClientUrl } from '../src/panel-route.ts';

// The Vite dev client, resolved by the dev server at runtime and found below the app's `base`. This
// page is prebuilt, so `import.meta.hot` is not an option: it only exists in modules the dev server
// transforms, and a build replaces it with undefined — which silently tree-shakes the whole panel
// away. createHotContext is the same primitive Vite injects when it rewrites import.meta.hot.
const { createHotContext } = await import(/* @vite-ignore */ viteClientUrl(location.pathname));

const hot = createHotContext('/__runespect/panel');
// `?source=/some/path` says which page this window was opened for — decisive when several pages are
// live on the dev server, where first-heard-wins is a coin flip.
const initialSourceUrl = new URLSearchParams(location.search).get('source') ?? undefined;

// Everything below is transport-agnostic: <Panel> only ever needed a Transport, which is why the
// same component runs in the browser extension, in the harness page and here.
mount(Panel, {
  target: document.getElementById('app')!,
  // Unbound on purpose: <Panel> hears every page on the channel and follows one by identity
  // (see sources.ts), which is what makes the source picker possible — a transport-level filter
  // would hide the other pages before the panel could offer them.
  props: { transport: createHotTransport(hot), initialSourceUrl },
});
