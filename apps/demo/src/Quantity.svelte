<script lang="ts">
  let { value = $bindable(1) }: { value?: number } = $props();
</script>

<button onclick={() => value > 1 && value--} aria-label="fewer">−</button>
<span class="qty">{value}</span>
<button onclick={() => value++} aria-label="more">+</button>

<style>
  .qty {
    display: inline-block;
    width: 1.5rem;
    text-align: center;
  }
</style>
