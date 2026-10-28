<script lang="ts">
  import { onMount } from 'svelte';
  import { relativeHref } from '#lib/paths.ts';
  import '#lib/docs.css';

  let { data } = $props();

  const here = $derived(data.page.path);
  const groups = $derived(
    Object.entries(Object.groupBy(data.menu.slice(1), (page) => page.group)) as [
      string,
      typeof data.menu,
    ][],
  );
  const reading = $derived(data.page.file === 'README.md' ? 'Overview' : data.doc.title);
  let menu: HTMLDetailsElement;
  let content: HTMLElement;
  let onScreen = $state(-1);

  // Open in the HTML, so the menu is there without a script; folded on a narrow screen, where it
  // would push the page down.
  const narrow = () => matchMedia('(max-width: 900px)').matches;
  onMount(() => {
    if (narrow()) menu.open = false;
  });

  // The section being read is the last whose heading has passed the top, or the last at the end.
  function track(): void {
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) return void (onScreen = data.doc.headings.length - 1);
    onScreen = data.doc.headings.findLastIndex(
      (h) => (document.getElementById(h.id)?.getBoundingClientRect().top ?? Infinity) <= 80,
    );
  }

  // A copy button on every block marked to copy; the blocks come from rendered Markdown.
  $effect(() => {
    void data.doc.html;
    for (const pre of content.querySelectorAll('pre[data-copy]')) {
      if (pre.querySelector('.copy')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.textContent = 'Copy';
      button.addEventListener('click', () => {
        void navigator.clipboard
          .writeText(pre.querySelector('code')!.textContent ?? '')
          .then(() => {
            button.textContent = 'Copied';
            setTimeout(() => (button.textContent = 'Copy'), 1500);
          });
      });
      pre.append(button);
    }
    track();
  });
</script>

<svelte:head>
  <title>{data.page.file === 'README.md' ? 'Docs' : data.doc.title} · runespect</title>
</svelte:head>

<svelte:window onscroll={track} />

{#snippet item(target: (typeof data.menu)[number])}
  <li>
    <a
      href={relativeHref(here, target.path)}
      aria-current={target.file === data.page.file ? 'page' : undefined}
      onclick={() => narrow() && (menu.open = false)}>{target.name}</a
    >
    {#if target.file === data.page.file && data.doc.headings.length}
      <ul class="sections">
        {#each data.doc.headings as heading, i (heading.id)}
          <li>
            <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own docs, escaped as they are rendered at build time -->
            <a href="#{heading.id}" class:on-screen={i === onScreen}>{@html heading.html}</a>
          </li>
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="docs">
  <details class="docs-menu" open bind:this={menu}>
    <summary>Docs · {reading}</summary>
    <nav aria-label="Docs">
      <ul>{@render item(data.menu[0])}</ul>
      {#each groups as [group, pages] (group)}
        <p class="docs-group">{group}</p>
        <ul>
          {#each pages as target (target.file)}{@render item(target)}{/each}
        </ul>
      {/each}
    </nav>
  </details>
  <main class="doc" id="content" bind:this={content}>
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- our own docs, escaped as they are rendered at build time -->
    {@html data.doc.html}
    <nav class="pager" aria-label="Previous and next">
      {#if data.pager.prev}
        <a class="prev" href={relativeHref(here, data.pager.prev.path)}
          ><span class="dir">← Previous</span><span class="group">{data.pager.prev.group}</span
          ><span class="name">{data.pager.prev.name}</span></a
        >
      {/if}
      {#if data.pager.next}
        <a class="next" href={relativeHref(here, data.pager.next.path)}
          ><span class="dir">Next →</span><span class="group">{data.pager.next.group}</span><span
            class="name">{data.pager.next.name}</span
          ></a
        >
      {/if}
    </nav>
  </main>
</div>
