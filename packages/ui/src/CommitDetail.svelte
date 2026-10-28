<svelte:options css="injected" />

<script lang="ts">
  import type { Commit } from '@runespect/agent/protocol/internal';
  import ValueView from './ValueView.svelte';
  import { changeLabel, changeKey, formatCommitTime } from './history';

  // The right pane of the history tab: every change in the selected commit, with the value it was
  // and the value it became.
  //
  // Values are shown, never fetched. A recorded value is depth-1 dehydrated, and inspect/hydrate
  // asks the PAGE — which would answer with today's value. Expanding what was kept is honest;
  // drilling past it would quietly show the present dressed as the past.
  let {
    commit = null,
    onSelect = () => {},
  }: {
    commit?: Commit | null;
    onSelect?: (id: number) => void;
  } = $props();
</script>

<div class="rs-commit-detail" data-testid="runespect-history-detail">
  {#if !commit}
    <p class="empty">Select a commit to see what changed.</p>
  {:else}
    <h3>
      <span class="seq">#{commit.seq}</span>
      <span class="time">{formatCommitTime(commit.t)}</span>
    </h3>
    <ul class="changes">
      {#each commit.changes as change, i (`${changeKey(change)}:${change.id}:${i}`)}
        <li class="change" data-change-detail={changeKey(change)}>
          <button
            class="node"
            data-change={changeKey(change)}
            title="Select this component in the tree"
            onclick={() => onSelect(change.id)}>{changeLabel(change)}</button
          >
          {#if change.op === 'update'}
            <div class="side">
              <span class="tag">before</span>
              <ValueView value={change.from} />
            </div>
            <div class="side">
              <span class="tag">after</span>
              <ValueView value={change.to} />
            </div>
          {:else}
            <div class="side">
              <span class="tag">{change.op === 'add' ? 'mounted' : 'unmounted'}</span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="note">
      ⓘ Values are shown as they were recorded — deeper levels are not kept for the past.
    </p>
  {/if}
</div>

<style>
  .rs-commit-detail {
    height: 100%;
    overflow: auto;
  }
  h3 {
    display: flex;
    gap: 8px;
    margin: 0 0 6px;
    font-size: inherit;
  }
  .seq {
    color: var(--rs-muted);
  }
  .time {
    color: var(--rs-sym);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .change {
    margin-bottom: 8px;
  }
  .node {
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--rs-name);
    font-weight: bold;
    cursor: pointer;
  }
  .node:hover {
    text-decoration: underline;
  }
  .side {
    display: flex;
    gap: 6px;
    padding-left: 12px;
  }
  .tag {
    color: var(--rs-muted);
    min-width: 44px;
  }
  .empty,
  .note {
    color: var(--rs-muted);
  }
  .note {
    margin-top: 12px;
    font-size: 11px;
  }
</style>
