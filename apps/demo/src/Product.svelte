<script lang="ts">
  import { add } from './cart.svelte.ts';
  import Quantity from './Quantity.svelte';

  let {
    product,
    favourite,
    onfavourite,
  }: {
    product: { name: string; price: number };
    favourite: boolean;
    onfavourite: () => void;
  } = $props();
  let qty = $state(1);
</script>

<button class="heart" onclick={onfavourite} aria-label="favourite {product.name}"
  >{favourite ? '♥' : '♡'}</button
>
<span class="name">{product.name}</span>
<span class="price">{product.price.toFixed(2)}</span>
<Quantity bind:value={qty} />
<button onclick={() => add(product.name, product.price, qty)}>Add to cart</button>

<style>
  .heart {
    border: 0;
    background: none;
    color: #c2185b;
    cursor: pointer;
  }
  .name {
    display: inline-block;
    width: 5rem;
  }
  .price {
    display: inline-block;
    width: 3rem;
  }
</style>
