import { mount } from 'svelte';
import { Panel } from '@runespect/ui/internal';
import { createHotTransport, pageChannel, type HotChannel } from '@runespect/agent/internal';
import { IN_BUILD_META, viteClientUrl } from '../src/panel-route.ts';

// The Vite dev client, resolved by the dev server at runtime and found below the app's `base`. This
// page is prebuilt, so `import.meta.hot` is not an option: it only exists in modules the dev server
// transforms, and a build replaces it with undefined — which silently tree-shakes the whole panel
// away. createHotContext is the same primitive Vite injects when it rewrites import.meta.hot.
async function devServerChannel(): Promise<HotChannel> {
  const { createHotContext } = await import(/* @vite-ignore */ viteClientUrl(location.pathname));
  return createHotContext('/__runespect/panel');
}

// A build has no dev server: runespect() marks the page it adds to the build.
const inBuild = document.querySelector(`meta[name="${IN_BUILD_META}"]`);
const hot = inBuild ? pageChannel() : await devServerChannel();
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
