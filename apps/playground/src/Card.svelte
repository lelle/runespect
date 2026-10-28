<script lang="ts">
  let { title, children }: { title?: string; children?: import('svelte').Snippet } = $props();
</script>

<section>
  <h3>{title}</h3>
  {@render children?.()}
</section>
