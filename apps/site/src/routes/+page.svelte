<script lang="ts">
  import { resolve } from '$app/paths';
  import panel from '../../../../docs/images/panel.png';
  import glass from '../../../../packages/extension/public/icons/icon-128.png';

  const root = resolve('/');
  const description =
    'Devtools for Svelte 5: the component tree and live runes state, with editing, next to your app.';
</script>

<svelte:head>
  <title>runespect — devtools for Svelte 5</title>
  <meta name="description" content={description} />
  <meta property="og:title" content="runespect" />
  <meta property="og:description" content={description} />
</svelte:head>

<main id="content" class="home">
  <h1><img src={glass} alt="" width="64" height="64" />runespect</h1>
  <p class="lede">
    Devtools for <strong>Svelte 5</strong>: the component tree and live runes state (<code
      >$state</code
    >, <code>$derived</code>, <code>$props</code>), with editing — in a window next to your app, in
    an overlay inside it, or in a Chrome DevTools panel.
  </p>
  <p class="how">
    runespect does not read Svelte's private internals. A build-time plugin adds instrumentation
    written in Svelte's public API, which reports to a small agent in the page.
  </p>

  <p class="actions">
    <a class="button primary" href="{root}demo/" data-sveltekit-reload>Try it live</a>
    <a class="button" href={`${root}docs/`}>Read the docs</a>
  </p>

  <pre class="install"><code>npm install --save-dev @runespect/vite-plugin @runespect/agent</code
    ></pre>

  <img
    class="shot"
    src={panel}
    alt="The runespect panel: the component tree on the left, the selected component's props, state and derived values on the right"
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
