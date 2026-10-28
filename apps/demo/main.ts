import { mount } from 'svelte';
import { broadcast, createWindowTransport, setOpenInEditor } from '@runespect/agent/internal';
import { Panel } from '@runespect/ui/internal';
import Shop from './src/Shop.svelte';

// On a dev server runespect() starts the broadcast; this page is static, so it starts it itself.
// The panel then hears the shop over the same window.postMessage transport the extension relays.
// A visitor has no checkout to open in an editor.
setOpenInEditor(false);
broadcast();
mount(Shop, { target: document.getElementById('app')! });
mount(Panel, {
  target: document.getElementById('panel')!,
  props: { transport: createWindowTransport(window) },
});
