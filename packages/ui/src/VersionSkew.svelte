<script lang="ts">
  let { ui, agent }: { ui: string; agent: string | undefined } = $props();
</script>

<div class="runespect-version-skew" data-testid="runespect-version-skew" role="alert">
  <strong>runespect</strong>: @runespect/ui {ui} does not match the agent on this page ({agent ??
    'older than 0.1.1'}). Install the same version of @runespect/ui and @runespect/vite-plugin.
</div>

<style>
  .runespect-version-skew {
    position: fixed;
    right: 8px;
    bottom: 8px;
    max-width: 360px;
    padding: 8px 10px;
    background: #fff7ed;
    color: #7c2d12;
    border: 1px solid #c2410c;
    font:
      12px/1.4 system-ui,
      sans-serif;
    z-index: 2147483647;
  }
</style>
