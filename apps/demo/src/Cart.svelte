<script lang="ts">
  import { getContext } from 'svelte';
  import { currency } from './currency';
  import { clear, getLines, getSubtotal, remove } from './cart.svelte.ts';
  import { getOrders, placeOrder } from './orders.svelte.ts';
  import CartLine from './CartLine.svelte';
  import Checkout from './Checkout.svelte';

  class Delivery {
    express = $state(false);
    get fee(): number {
      return this.express ? 4.9 : 0;
    }
  }

  const shop = getContext<{ name: string }>('shop');
  const delivery = new Delivery();
  let coupon = $state('');
  const discount = $derived(coupon.toUpperCase() === 'SPRING' ? 0.1 : 0);
  const total = $derived(getSubtotal() * (1 - discount) + delivery.fee);
  let checkingOut = $state(false);
</script>

<section>
  <h2>Cart at {shop.name}</h2>
  {#each getLines() as line (line.name)}
    <CartLine {line}>
      {#snippet actions()}
        <button onclick={() => remove(line.name)} aria-label="remove {line.name}">×</button>
      {/snippet}
    </CartLine>
  {:else}
    <p>Nothing yet.</p>
  {/each}
  <label>Coupon <input bind:value={coupon} placeholder="try SPRING" /></label>
  <label><input type="checkbox" bind:checked={delivery.express} /> Express delivery</label>
  <p class="total">Total: {total.toFixed(2)} {$currency}</p>
  {#if checkingOut}
    <Checkout
      {total}
      onplace={(name) => {
        placeOrder(name, total);
        clear();
        checkingOut = false;
      }}
    />
  {:else}
    <button onclick={() => (checkingOut = true)} disabled={!getLines().length}>Check out</button>
  {/if}
  {#if getOrders().length}
    <p>Orders placed: {getOrders().length}</p>
  {/if}
</section>

<style>
  section {
    border-top: 1px solid #ccc;
    margin-top: 1rem;
  }
  label {
    display: block;
    margin: 0.4rem 0;
  }
  .total {
    font-weight: bold;
  }
</style>
