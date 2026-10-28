<script lang="ts">
  class Counter {
    n = $state(3);
    double = $derived(this.n * 2);
  }
  let c = new Counter();
</script>

<button onclick={() => (c.n += 1)}>{c.n} / {c.double}</button>
