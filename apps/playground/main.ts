/// <reference types="vite/client" />
import { mount } from 'svelte';
import Showcase from './src/Showcase.svelte';

// The showcase is auto-instrumented by @runespect/vite-plugin; the overlay reads the
// shared @runespect/agent store, so it shows the app's full tree + live, editable state. The overlay
// is a panel, so `?no-overlay` keeps the page as it is before any panel opens.
mount(Showcase, { target: document.getElementById('app')! });
if (import.meta.env.DEV && !new URLSearchParams(location.search).has('no-overlay')) {
  import('@runespect/ui').then(({ Inspect }) => mount(Inspect, { target: document.body }));
}
