<script lang="ts">
  import { onMount } from 'svelte';

  // The page follows the system until the reader picks a theme; the pick is kept in this browser
  // and applied from app.html before the page is drawn. The switch offers the theme the page is
  // not in, so it is shown only once the script knows which that is.
  type Theme = 'dark' | 'light';
  let current = $state<Theme | null>(null);
  const next = $derived(current === 'dark' ? 'light' : 'dark');

  onMount(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const read = () =>
      (document.documentElement.dataset.theme as Theme | undefined) ??
      (system.matches ? 'dark' : 'light');
    current = read();
    const follow = () => (current = read());
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  });

  function toggle(): void {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Kept for this page only.
    }
    current = next;
  }
</script>

{#if current}
  <!-- The sun and the moon, from Primer Octicons (MIT). -->
  <button type="button" class="theme" aria-label="Switch to {next} theme" onclick={toggle}>
    {#if next === 'light'}
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.657-8.157a.75.75 0 0 1 0 1.061l-1.061 1.06a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm13 0a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8Zm-8 5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13Zm3.536-1.464a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-1.06-1.06a.75.75 0 0 1 0-1.06Z"
        /></svg
      >
    {:else}
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"
        ><path
          fill="currentColor"
          d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"
        /></svg
      >
    {/if}
  </button>
{/if}
