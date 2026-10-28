<script lang="ts">
  import { add, clear, getCount, getCoupon, settings, useCoupon } from './modules/cart.svelte';
</script>

<button onclick={() => add('apple')}>{getCount()}</button>
<button onclick={clear}>clear</button>
<button onclick={() => useCoupon('SPRING')}>coupon: {getCoupon()}</button>
<label><input type="checkbox" bind:checked={settings.vat} /> VAT</label>
