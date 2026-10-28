<script lang="ts">
  // Declarations the preprocessor must read: casts, satisfies, destructuring, quoted class fields.
  let el = $state<HTMLElement>()!;
  let n = $state(0) as number;
  let cfg = $state({ a: 1 }) satisfies { a: number };
  const copy = $state.snapshot({ a: 1 });
  let [first, second] = $derived([n, n + 1]);
  class B {
    'a-b' = $state(0);
    c = $state(1);
  }
  const b = new B();
</script>

<p bind:this={el}>{n} {cfg.a} {copy.a} {first} {second} {b.c} {b['a-b']}</p>
