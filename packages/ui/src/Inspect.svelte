<script lang="ts">
  import { mount, unmount } from 'svelte';
  import * as agent from '@runespect/agent/internal';
  import { version } from '../package.json';
  import Overlay from './Overlay.svelte';
  import VersionSkew from './VersionSkew.svelte';

  // The overlay renders inside a shadow root of its own: the host page's element rules (button,
  // li, a, input) and theme selectors cannot reach it. Its components inject their styles, which
  // Svelte puts in the root they are mounted into.
  //
  // Its agent is the plugin's, not necessarily of this version, and another version may lack what
  // the overlay calls: then it shows only a notice. An agent from before 0.1.1 reports no version.
  let host: HTMLDivElement;
  $effect(() => {
    const target = host.attachShadow({ mode: 'open' });
    const overlay =
      agent.version === version
        ? mount(Overlay, { target })
        : mount(VersionSkew, { target, props: { ui: version, agent: agent.version } });
    return () => void unmount(overlay);
  });
</script>

<div bind:this={host} data-testid="runespect-overlay-host"></div>
