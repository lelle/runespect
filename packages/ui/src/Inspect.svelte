<script lang="ts">
  import { mount, unmount } from 'svelte';
  import Overlay from './Overlay.svelte';

  // The overlay renders inside a shadow root of its own: the host page's element rules (button,
  // li, a, input) and theme selectors cannot reach it. Its components inject their styles, which
  // Svelte puts in the root they are mounted into.
  let host: HTMLDivElement;
  $effect(() => {
    const overlay = mount(Overlay, { target: host.attachShadow({ mode: 'open' }) });
    return () => void unmount(overlay);
  });
</script>

<div bind:this={host} data-testid="runespect-overlay-host"></div>
