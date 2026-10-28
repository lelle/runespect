<script lang="ts">
  import Counter from './Counter.svelte';
  import Field from './Field.svelte';
  import List from './List.svelte';
  import Card from './Card.svelte';
  import StoreComp from './StoreComp.svelte';
  import ClassComp from './ClassComp.svelte';
  import StatelessHost from './StatelessHost.svelte';
  import Toggler from './Toggler.svelte';
  import Settings from './Settings.svelte';
  import ContextProvider from './ContextProvider.svelte';
  import CartView from './CartView.svelte';
  import ReactivityComp from './ReactivityComp.svelte';

  let name = $state<string>('world');
</script>

<section>
  <h3>$state / $derived</h3>
  <Counter start={1} />
  <Counter start={10} />
</section>

<section>
  <h3>$bindable (two-way)</h3>
  <Field bind:value={name} />
  <p>name = {name}</p>
</section>

<section>
  <h3>Snippets</h3>
  <List items={['a', 'b', 'c']} />
  <Card title="hello">
    <p>card body (a snippet prop)</p>
    <Field bind:value={name} />
    <Field value={name} />
  </Card>
</section>

<section>
  <h3>Store</h3>
  <StoreComp />
</section>

<section>
  <h3>Reactive class fields</h3>
  <ClassComp />
</section>

<section>
  <h3>Stateless / script-less</h3>
  <StatelessHost />
</section>

<section>
  <h3>Writable object ($state) — edit-at-path</h3>
  <Settings />
</section>

<section>
  <h3>Context (getContext)</h3>
  <ContextProvider />
</section>

<section>
  <h3>Conditional (mount / unmount)</h3>
  <Toggler />
</section>

<section>
  <h3>Module state (.svelte.ts)</h3>
  <CartView />
</section>

<section>
  <h3>svelte/reactivity</h3>
  <ReactivityComp />
</section>

<style>
  section {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #eee;
  }
  h3 {
    margin: 0.5rem 0;
    color: #555;
    font-size: 0.95rem;
  }
</style>
