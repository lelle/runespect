<script lang="ts">
  import {
    MediaQuery,
    SvelteDate,
    SvelteMap,
    SvelteSet as Tags,
    SvelteURL,
    SvelteURLSearchParams,
  } from 'svelte/reactivity';

  const tags = new Tags<string>(['new']);
  const stock = new SvelteMap<string, number>([['apple', 3]]);
  const params = new SvelteURLSearchParams('q=apple');
  const wide = new MediaQuery('min-width: 600px');
  const due = new SvelteDate('2026-01-01T00:00:00Z');
  const link = new SvelteURL('https://shop.example/cart');
  let label = $state('tags');
</script>

<button onclick={() => tags.add('sale')}>{label}: {[...tags].join(', ')}</button>
<button onclick={() => stock.set('apple', stock.get('apple')! - 1)}>{stock.get('apple')}</button>
<button onclick={() => params.append('q', 'pear')}>{params}</button>
<p>{wide.current ? 'wide' : 'narrow'}</p>
<button onclick={() => due.setUTCFullYear(2027)}>{due.toISOString()}</button>
<button onclick={() => (link.pathname = '/checkout')}>{link.href}</button>
