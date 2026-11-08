<script lang="ts">
  import { resolve } from '$app/paths';
  import edit from '../../../../docs/images/edit.gif';
  import glass from '../../../../packages/extension/public/icons/icon-128.png';

  const root = resolve('/');
  const description =
    'Svelte 5 DevTools: see and edit the live $state, $derived and $props of every component.';
</script>

<svelte:head>
  <title>runespect — Svelte 5 DevTools</title>
  <meta name="description" content={description} />
  <meta property="og:title" content="runespect" />
  <meta property="og:description" content={description} />
</svelte:head>

<main id="content" class="home">
  <h1><img src={glass} alt="" width="64" height="64" />runespect</h1>
  <p class="lede">
    <strong>Svelte 5 DevTools</strong>: see and edit the live <code>$state</code>,
    <code>$derived</code> and <code>$props</code> of every component, in a window next to your app, an
    overlay inside it, or a Chrome DevTools tab.
  </p>
  <p class="how">
    runespect does not read Svelte's private internals. A build-time plugin adds instrumentation
    written in Svelte's public API, which reports to a small agent in the page.
  </p>

  <p class="actions">
    <a class="button primary" href="{root}demo/" data-sveltekit-reload>Try it live</a>
    <a class="button" href={`${root}docs/`}>Read the docs</a>
  </p>

  <pre class="install"><code>npm install --save-dev @runespect/vite-plugin</code></pre>

  <img
    class="shot"
    src={edit}
    alt="runespect next to a small shop: a value edited in the panel changes the shop"
  />

  <h2>What you get</h2>
  <ul class="features">
    <li>
      <strong>The component tree and live state</strong>, grouped by kind: props, state, derived,
      stores, class fields, context
    </li>
    <li>
      <strong>Module state</strong> from <code>.svelte.ts</code> files, under Modules in the tree
    </li>
    <li>
      <strong>Editing</strong> of <code>$state</code> and <code>$bindable</code> values, nested fields
      included
    </li>
    <li><strong>History</strong>: what changed and when, flush by flush</li>
    <li><strong>Search</strong>, an element picker, and open in editor</li>
    <li><strong>A console API</strong> for scripts, tests and coding agents</li>
  </ul>
</main>
