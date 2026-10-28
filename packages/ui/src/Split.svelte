<svelte:options css="injected" />

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { splitPercent, clampSplit, SPLIT_MIN, SPLIT_MAX } from './layout';

  // Two panes with a draggable, keyboard-operable divider, shared by the tree and the history tab:
  // the divider is not two divs — it carries ARIA (role="separator" + aria-valuenow), arrow-key
  // resizing and dragging, and that is exactly the kind of code that rots when it exists twice.
  let {
    pct = $bindable(45),
    label = 'Resize panes',
    left,
    right,
  }: {
    /** Left-pane width as a % of the container. Bindable so the host can persist it. */
    pct?: number;
    label?: string;
    left: Snippet;
    right: Snippet;
  } = $props();

  let el = $state<HTMLDivElement>();

  // A drag ends on release, on a cancelled pointer (a gesture taken over by the browser), and when
  // the panes go away mid-drag; otherwise every later move would keep resizing.
  let endDrag: (() => void) | null = null;
  $effect(() => () => endDrag?.());

  function startResize(e: PointerEvent): void {
    e.preventDefault();
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    endDrag?.();
    const onMove = (ev: PointerEvent): number =>
      (pct = splitPercent(ev.clientX, rect.left, rect.width));
    const end = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      endDrag = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    endDrag = end;
  }

  function onResizeKey(e: KeyboardEvent): void {
    const step = e.key === 'ArrowLeft' ? -4 : e.key === 'ArrowRight' ? 4 : 0;
    if (step) pct = clampSplit(pct + step);
    else if (e.key === 'Home') pct = SPLIT_MIN;
    else if (e.key === 'End') pct = SPLIT_MAX;
    else return;
    e.preventDefault();
  }
</script>

<div class="split" bind:this={el}>
  <div class="pane left" style:flex="0 0 {pct}%">{@render left()}</div>
  <!-- ARIA window-splitter: a focusable role="separator" with aria-valuenow IS interactive -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="resizer"
    role="separator"
    aria-orientation="vertical"
    aria-valuenow={Math.round(pct)}
    aria-valuemin={SPLIT_MIN}
    aria-valuemax={SPLIT_MAX}
    aria-label={label}
    tabindex="0"
    data-testid="runespect-resizer"
    title="Drag to resize"
    onpointerdown={startResize}
    onkeydown={onResizeKey}
  ></div>
  <div class="pane right">{@render right()}</div>
</div>

<style>
  .split {
    display: flex;
    align-items: stretch;
    gap: 8px;
    flex: 1 1 auto;
    min-height: 0;
  }
  .pane {
    min-width: 0;
  }
  .left {
    overflow: hidden;
  }
  .right {
    flex: 1 1 0;
    overflow: auto;
    border-left: 1px solid var(--rs-border-soft);
    padding-left: 8px;
  }
  .resizer {
    flex: 0 0 4px;
    align-self: stretch;
    cursor: col-resize;
    background: var(--rs-border-soft);
    border-radius: 2px;
  }
  .resizer:hover,
  .resizer:focus-visible {
    background: var(--rs-accent);
    outline: none;
  }
</style>
