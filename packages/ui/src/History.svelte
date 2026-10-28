<svelte:options css="injected" />

<script lang="ts">
  import type { Commit } from '@runespect/agent/protocol/internal';
  import { newestFirst, forNode, changeLabel, formatCommitTime } from './history';

  // The history tab: what changed, when, grouped by the flush it happened in. Read-only by design —
  // only $state is writable, $derived recomputes and side effects already happened, so restoring a
  // past state would be a promise we cannot keep.
  let {
    commits = [],
    truncated = false,
    selectedId = null,
    onlySelected = $bindable(false),
    selectedSeq = $bindable<number | null>(null),
  }: {
    commits?: Commit[];
    truncated?: boolean;
    selectedId?: number | null;
    onlySelected?: boolean;
    /** Which commit the detail pane is showing. Bindable so the host owns the pairing. */
    selectedSeq?: number | null;
  } = $props();

  let shown = $derived(newestFirst(forNode(commits, onlySelected ? selectedId : null)));

  // Following stops the moment you touch the list: a list that jumps while you read it is unusable,
  // which is why log viewers work this way. One state: null means following, a number is the newest
  // commit on screen when you took over. By number, not by count: once the ring is full the count
  // stays the same while new commits push in.
  let pausedAt = $state<number | null>(null);
  let pending = $derived(pausedAt == null ? 0 : shown.filter((c) => c.seq > pausedAt!).length);
  let visible = $derived(pausedAt == null ? shown : shown.filter((c) => c.seq <= pausedAt!));
  function pause(): void {
    pausedAt ??= shown[0]?.seq ?? 0;
  }
  function resume(): void {
    pausedAt = null;
  }

  // A one-line hint of what moved, so the list is scannable without opening every commit.
  function summary(commit: Commit): string {
    const names = [...new Set(commit.changes.map(changeLabel))];
    return names.length > 2 ? `${names.slice(0, 2).join(', ')}, …` : names.join(', ');
  }
</script>

<div class="rs-history" data-testid="runespect-history" onscroll={pause}>
  <div class="bar">
    <label class="filter">
      <input type="checkbox" data-testid="runespect-history-only" bind:checked={onlySelected} />
      only selected
    </label>
    {#if pending > 0}
      <button class="pending" data-testid="runespect-history-resume" onclick={resume}
        >⏸ {pending} new — show</button
      >
    {/if}
    {#if truncated}
      <span
        class="truncated"
        data-testid="runespect-history-truncated"
        title="The oldest commits were dropped to stay within the memory budget"
        >older history dropped</span
      >
    {/if}
  </div>

  {#if visible.length === 0}
    <p class="empty" data-testid="runespect-history-empty">
      {onlySelected && selectedId != null
        ? 'Nothing has changed in this component yet.'
        : 'No state changes recorded yet.'}
    </p>
  {:else}
    <ul class="commits">
      {#each visible as commit (commit.seq)}
        <li class="commit">
          <button
            class="head"
            class:selected={commit.seq === selectedSeq}
            data-commit={commit.seq}
            onclick={() => (pause(), (selectedSeq = commit.seq))}
          >
            <span class="seq">#{commit.seq}</span>
            <span class="time">{formatCommitTime(commit.t)}</span>
            <span class="count"
              >{commit.changes.length} change{commit.changes.length === 1 ? '' : 's'}</span
            >
            <span class="what">{summary(commit)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .rs-history {
    height: 100%;
    overflow: auto;
    font: inherit;
  }
  .bar {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
    color: var(--rs-muted);
  }
  .filter {
    display: flex;
    gap: 4px;
    align-items: center;
    white-space: nowrap;
  }
  .pending,
  .head {
    background: transparent;
    color: inherit;
    font: inherit;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  /* The resume button is the one thing here that should look like a button. */
  .pending {
    border: 1px solid var(--rs-accent);
    border-radius: 3px;
    padding: 0 6px;
    color: var(--rs-fg);
  }
  .truncated {
    margin-left: auto;
    font-size: 11px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .head {
    display: flex;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 1px 0;
  }
  .head:hover {
    background: var(--rs-bg-elev);
  }
  .head.selected {
    background: color-mix(in srgb, var(--rs-accent) 30%, transparent);
    outline: 1px solid var(--rs-accent);
    border-radius: 2px;
  }
  .what {
    color: var(--rs-name);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seq {
    color: var(--rs-muted);
  }
  .time {
    color: var(--rs-sym);
  }
  .empty {
    color: var(--rs-muted);
  }
</style>
