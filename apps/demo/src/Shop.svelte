<script lang="ts">
  import { setContext } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import Banner from './Banner.svelte';
  import Product from './Product.svelte';
  import Cart from './Cart.svelte';
  import Footer from './Footer.svelte';

  setContext('shop', { name: 'Corner shop', country: 'NO' });

  const products = [
    { name: 'Apple', price: 0.5 },
    { name: 'Bread', price: 3.2 },
    { name: 'Coffee', price: 7.9 },
  ];
  const favourites = new SvelteSet<string>();
  let search = $state('');
  const shown = $derived(
    products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
  );
</script>

<h1>Corner shop</h1>
<Banner code="SPRING" />
<input placeholder="Search products" bind:value={search} />
<ul>
  {#each shown as product (product.name)}
    <li>
      <Product
        {product}
        favourite={favourites.has(product.name)}
        onfavourite={() =>
          favourites.has(product.name)
            ? favourites.delete(product.name)
            : favourites.add(product.name)}
      />
    </li>
  {/each}
</ul>
<Cart />
<Footer />

<style>
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    margin: 0.4rem 0;
  }
</style>
