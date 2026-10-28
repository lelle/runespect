import { mount } from 'svelte';
import PanelHarness from './src/PanelHarness.svelte';
import { Panel } from '@runespect/ui/internal';
import { createWindowTransport } from '@runespect/agent/internal';

// Dev/e2e harness for <Panel>, which normally only runs inside the extension's DevTools context.
// Here the instrumented app and the panel share one page and talk over the same window.postMessage
// transport the extension relays, so this exercises the real bridge rather than a stub.
const rows = Number(new URLSearchParams(location.search).get('rows') ?? 0);

mount(PanelHarness, { target: document.getElementById('app')!, props: { rows } });
mount(Panel, {
  target: document.getElementById('panel')!,
  props: { transport: createWindowTransport(window) },
});
