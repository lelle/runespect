<svelte:options css="injected" />

<script lang="ts">
  import {
    isRunespectMessage,
    isToPanel,
    type ToPageMessage,
    type ToPanelMessage,
    HISTORY_COMMITS,
    type Commit,
    editMessage,
    highlightMessage,
    pickMessage,
    logMessage,
    storeGlobalMessage,
    inspectMessage,
    PROTOCOL_VERSION,
    type Transport,
    type SerializedNode,
  } from '@runespect/agent/protocol/internal';
  import { clipboardText } from './valueView';

  import { loadSetting, saveSetting } from './persisted';
  import { isTypingTarget } from './shortcuts';
  import { clampSplit } from './layout';
  import { dismissOn } from './dismiss';
  import { untrack } from 'svelte';
  import { themeStyle, THEMES, type ThemeSetting } from './theme';
  import { Theme } from './theme.svelte';
  import { Search } from './search.svelte';
  import { Preferences } from './preferences.svelte';
  import { formatBuildInfo, type BuildInfo } from './build';
  import { mergeCommits } from './history';
  import History from './History.svelte';
  import CommitDetail from './CommitDetail.svelte';
  import { panelStatus } from './status';
  import { lastSeenLabel, sourceLabel } from './sources';
  import { startFollowing, follow, type FollowStep } from './follow';
  import { EMPTY, hold, shown, type Held } from './held';
  import Tree from './Tree.svelte';
  import Detail from './Detail.svelte';
  import SettingsMenu from './SettingsMenu.svelte';
  import StateFilterChip from './StateFilterChip.svelte';
  import Split from './Split.svelte';
  import PaneBoundary from './PaneBoundary.svelte';

  // The panel: the DevTools tab, the /__runespect/ window and the test harness all mount it. Driven
  // entirely by a transport (no agent access). Renders the tree
  // from tree/ops messages and sends edits + page-side actions back. Actions that need the page
  // DOM/context (highlight, pick, log, store-as-global) round-trip to the agent via the transport;
  // copy is done panel-side since the panel already holds the value.
  // `buildInfo` is injected by whoever built the panel bundle (see the extension's vite define);
  // without it the footer says "dev build" rather than implying a release.
  let {
    transport,
    buildInfo,
    initialSourceUrl,
    onError,
  }: {
    transport: Transport;
    buildInfo?: BuildInfo;
    /**
     * Which page to follow when several are on the channel, e.g. from `/__runespect/?source=/admin`.
     * Beats the remembered choice, because it says what this panel was opened *for*; without it the
     * panel falls back to first-heard, which is a coin flip when more than one page is live.
     */
    initialSourceUrl?: string;
    /** A pane failed to render; the extension records it in the hop log, so dump() has it. */
    onError?: (pane: string, error: unknown) => void;
  } = $props();
  // Raw: every step replaces the held tree, never edits it in place, so deep proxies would only cost
  // a signal per node and value.
  let held: Held = $state.raw(EMPTY);
  let nodes = $derived(shown(held));
  // Shared with the overlay, under the same keys. Sticky prefs are restored from localStorage and
  // saved on change; best-effort, see persisted.ts.
  const prefs = new Preferences();
  const theme = new Theme();
  // A search match is selected and highlighted in the page.
  const search = new Search(
    () => nodes,
    (id) => {
      selectedId = id;
      onHover(id);
    },
  );
  // Panel-only prefs.
  let exclude = $state(loadSetting('exclude', ''));
  // ── tabs ──
  let tab = $state<'tree' | 'history'>(
    loadSetting('tab', 'tree', (v) => v === 'tree' || v === 'history'),
  );
  // ── state history ──
  // Built from the ops the panel receives anyway, and backfilled from the agent's ring for what
  // happened before this panel connected — which is the normal case, since you open devtools after
  // noticing something. Bounded by the agent's own HISTORY_COMMITS: the ring is the source of truth.
  let commits = $state.raw<Commit[]>([]);
  let historyTruncated = $state(false);
  let historyOnlySelected = $state(loadSetting('historyOnlySelected', false));
  let historySeq = $state<number | null>(null);
  let historySplit = $state(clampSplit(loadSetting('historySplit', 45)));
  let selectedCommit = $derived(commits.find((c) => c.seq === historySeq) ?? null);
  let selectedId = $state<number | null>(null);
  let picking = $state(false);
  // ── which page we are looking at ──
  // One dev server is one channel: a second tab, another route, or islands from separate bundles all
  // announce themselves here. We follow exactly one; follow.ts decides which, and every message in
  // or command out goes through it.
  // Deliberately the initial value: this seeds the choice at mount, after which the user's picks own
  // it. Reading it reactively would drag the panel back every time the prop re-evaluated.
  // svelte-ignore state_referenced_locally
  const start = startFollowing({
    rememberedUrl:
      initialSourceUrl ??
      loadSetting<string | null>('sourceUrl', null, (v) => typeof v === 'string'),
    waitForUrl: initialSourceUrl != null,
  });
  let following = $state.raw(start.state);
  let sources = $derived(following.sources);
  let followedId = $derived(following.followedId);
  let followed = $derived(sources.find((s) => s.id === followedId) ?? null);
  let sourcesOpen = $state(false);
  // Ticks only while the picker is open: it feeds the "last seen" ages in the dropdown and nothing
  // else, and this runs inside the inspected page in the harness embeddings.
  let now = $state(Date.now());
  $effect(() => {
    if (!sourcesOpen) return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  // Escape or a click outside closes it, as <ContextMenu> and <SettingsMenu> do.
  let sourcesEl = $state<HTMLElement>();
  $effect(() => {
    if (!sourcesOpen) return;
    return dismissOn(
      () => sourcesEl,
      () => (sourcesOpen = false),
    );
  });

  function apply(step: FollowStep): void {
    following = step.state;
    if (step.switched) forgetPage();
    for (const message of step.send) transport.send(message);
    if (step.deliver) show(step.deliver);
  }

  // Every command goes to the page we follow, addressed by follow.ts.
  function send(message: ToPageMessage): void {
    apply(follow(following, { type: 'command', msg: message }, Date.now()));
  }

  // The tree and the history belong to the page we were following; drop them rather than blend two
  // apps.
  // Node ids and commit numbers are per page, so the selection goes too.
  function forgetPage(): void {
    held = EMPTY;
    commits = [];
    selectedId = null;
    historySeq = null;
    historyTruncated = false;
  }

  function pickSource(id: string): void {
    sourcesOpen = false;
    apply(follow(following, { type: 'pick', id }, Date.now()));
  }

  // ── which source is feeding us ──
  // The page names its tier in the handshake; a tree that arrives without one is the extension's
  // names-only DOM walk. We wait GRACE_MS before saying so, since a slow plugin page can lose the race
  // to the names-only walk's first broadcast and would otherwise flash a warning it doesn't deserve.
  const GRACE_MS = 2000;
  // The page turns it off with runespect({ openInEditor: false }) and says so in its hello. Without
  // a hello this is Names only, whose paths are relative to a project root the panel cannot know.
  let openInEditor = $derived(following.page.openInEditor && following.page.tier !== null);
  let graceElapsed = $state(false);
  $effect(() => {
    const id = setTimeout(() => (graceElapsed = true), GRACE_MS);
    return () => clearTimeout(id);
  });
  let status = $derived(
    panelStatus({
      tier: following.page.tier,
      problem: following.page.problem,
      mismatchVersion: following.page.version === PROTOCOL_VERSION ? null : following.page.version,
      panelVersion: PROTOCOL_VERSION,
      hasTree: nodes.length > 0,
      graceElapsed,
    }),
  );
  // The selected node re-derives from the live tree, so the detail pane updates as values change.
  let selectedNode = $derived(nodes.find((n) => n.id === selectedId) ?? null);
  let selectedSent = $derived(held.sent.find((n) => n.id === selectedId) ?? null);

  // What the page we follow sent, after follow.ts has filtered it.
  function show(msg: ToPanelMessage): void {
    // Full snapshot: keep the last non-empty tree so an empty broadcast (e.g. a capture
    // with no recorded data) doesn't blank a tree another source already provided.
    if (msg.kind === 'tree' && (msg.nodes.length || held.sent.length === 0))
      held = hold(held, { type: 'tree', nodes: msg.nodes }).state;
    // Incremental delta: apply add/update/remove to the tree we already hold.
    else if (msg.kind === 'ops') {
      const step = hold(held, {
        type: 'ops',
        ops: msg.ops,
        commit: msg.commit,
        t: msg.t ?? Date.now(),
      });
      held = step.state;
      if (step.commit?.changes.length)
        commits = mergeCommits(commits, [step.commit], HISTORY_COMMITS);
    }
    // The page's element-picker reply: select the picked node, leave pick mode.
    else if (msg.kind === 'picked') {
      if (msg.id != null) selectedId = msg.id;
      picking = false;
    }
    // Lazy-inspect reply: kept beside the tree the page sent, and shown spliced into it.
    else if (msg.kind === 'hydrate') {
      held = hold(held, { type: 'hydrate', id: msg.id, path: msg.path, value: msg.value }).state;
    }
    // The page's backlog: what happened before this panel connected.
    else if (msg.kind === 'history') {
      commits = mergeCommits(commits, msg.commits, HISTORY_COMMITS);
      historyTruncated = msg.truncated;
    }
  }

  $effect(() => {
    const off = transport.onMessage?.((msg) => {
      if (!isRunespectMessage(msg)) return;
      if (!isToPanel(msg)) return; // panel only handles agent→panel kinds (compiler-enforced)
      apply(follow(following, { type: 'heard', msg }, Date.now()));
    });
    return off;
  });
  // Ask who is there once the listener above is in place, so no answer is missed.
  $effect(() => untrack(() => start.send.forEach((message) => transport.send(message))));

  function onEdit(id: number, symbol: string, path: (string | number)[], value: unknown): void {
    send(editMessage(id, symbol, value, path));
  }
  function onHover(id: number | null): void {
    send(highlightMessage(id));
  }
  function onLog(node: SerializedNode): void {
    send(logMessage(node.id));
  }
  function onStoreGlobal(id: number, symbol: string): void {
    send(storeGlobalMessage(id, symbol));
  }
  function onCopy(value: unknown): void {
    void navigator.clipboard?.writeText(clipboardText(value));
  }
  // `limit` is not written `limit?:` — Svelte 5.40–5.50 cannot strip an optional parameter's type.
  function onInspect(
    id: number,
    symbol: string,
    path: (string | number)[],
    limit: number | undefined = undefined,
  ): void {
    held = hold(held, { type: 'asked', id, path: [symbol, ...path], limit }).state;
    send(inspectMessage(id, [symbol, ...path], limit));
  }
  function togglePick(): void {
    picking = !picking;
    send(pickMessage(picking));
  }

  // ── keyboard shortcuts ── ("/" focuses the filter unless already typing; Escape clears it).
  // Panel-only — the overlay shares the host page, so we don't hijack its keys.
  let searchEl = $state<HTMLInputElement>();
  function onShortcut(e: KeyboardEvent): void {
    if (e.key === '/' && !isTypingTarget(e.target)) {
      e.preventDefault();
      searchEl?.focus();
    } else if (e.key === 'Escape' && search.query) {
      search.set('');
      searchEl?.blur();
    }
  }

  // ── resizable tree/detail split ── (tree-pane width %, persisted; the divider itself lives in
  // <Split>, which the history tab reuses)
  let splitPct = $state(clampSplit(loadSetting('splitPct', 45)));
  // Persist sticky prefs as they change (save-to-storage sync, not state derivation).
  $effect(() => saveSetting('splitPct', splitPct));
  $effect(() => saveSetting('exclude', exclude));
  $effect(() => saveSetting('tab', tab));
  $effect(() => saveSetting('historyOnlySelected', historyOnlySelected));
  $effect(() => saveSetting('historySplit', historySplit));
  // Remembered by url, not by id: a reload gives the page a new id, and following the url is what
  // takes you back to the app you were on rather than to a forgotten tab.
  $effect(() => {
    if (following.rememberedUrl != null) saveSetting('sourceUrl', following.rememberedUrl);
  });
</script>

<svelte:window onkeydown={onShortcut} />

<div
  class="runespect-panel"
  data-testid="runespect-panel"
  data-theme={theme.resolved}
  style={themeStyle(theme.resolved)}
>
  {#if status.level === 'warn'}
    <!-- Expanded: the panel can't do what you expect, so it says what it is and where to read up. -->
    <div class="status-bar" data-testid="runespect-status" data-level={status.level}>
      <span class="status-label">⚠ {status.label}</span>
      <span class="status-detail">{status.detail}</span>
      {#if status.docsUrl}
        <a href={status.docsUrl} target="_blank" rel="noreferrer"
          >{status.docsLabel ?? 'How to get live state'} ↗</a
        >
      {/if}
    </div>
  {/if}
  <div class="toolbar">
    <button
      class="pick"
      class:active={picking}
      data-testid="runespect-pick"
      aria-pressed={picking}
      onclick={togglePick}>⌖ pick</button
    >
    <input
      bind:this={searchEl}
      class="search"
      type="search"
      placeholder="Filter (text or /regex/)"
      aria-label="Filter components by name"
      data-testid="runespect-search"
      value={search.query}
      oninput={(e) => search.set(e.currentTarget.value)}
      onkeydown={(e) => search.key(e)}
    />
    {#if search.status}
      <span class="search-count" data-testid="runespect-search-count">{search.status}</span>
    {/if}
    <input
      class="search exclude"
      type="search"
      placeholder="Hide (name/file)…"
      aria-label="Hide components by name or file"
      data-testid="runespect-exclude"
      title="Hide components by name or file (comma-separated); their children stay"
      bind:value={exclude}
    />
    {#if status.level !== 'warn'}
      <!-- Collapsed: a chip, so you can always tell Live from Names only or a capture without losing a row. -->
      <span
        class="status-chip"
        data-testid="runespect-status"
        data-level={status.level}
        title={status.detail}>{status.label}</span
      >
      <!-- Which page, beside the tier rather than inside it, so each element says one thing. -->
      {#if followed}
        <span class="status-chip source-chip" title={sourceLabel(followed)}>
          {#if sources.length > 1}
            <button
              class="source"
              data-testid="runespect-source"
              aria-expanded={sourcesOpen}
              title="Choose which page to follow"
              onclick={() => (sourcesOpen = !sourcesOpen)}>{sourceLabel(followed)} ▾</button
            >
          {:else}
            <span class="source" data-testid="runespect-source">{sourceLabel(followed)}</span>
          {/if}
        </span>
      {/if}
      {#if sourcesOpen && sources.length > 1}
        <ul
          class="sources"
          data-testid="runespect-sources"
          aria-label="Pages to follow"
          bind:this={sourcesEl}
        >
          {#each sources as source (source.id)}
            <li>
              <button
                data-source={source.id}
                class:current={source.id === followedId}
                onclick={() => pickSource(source.id)}
              >
                <span class="mark">{source.id === followedId ? '●' : '○'}</span>
                <span class="label">{sourceLabel(source)}</span>
                <!-- An age, not a verdict: a quiet page and a closed one look the same here. -->
                <span class="seen">{lastSeenLabel(source, now)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    <SettingsMenu
      footer={formatBuildInfo(buildInfo, PROTOCOL_VERSION)}
      items={[
        { label: 'Flash on update', checked: prefs.flash, onChange: (v) => (prefs.flash = v) },
        {
          label: 'Expand values',
          checked: prefs.expandValues,
          onChange: (v) => (prefs.expandValues = v),
        },
        {
          label: 'Only components with state',
          checked: prefs.onlyStateful,
          onChange: (v) => (prefs.onlyStateful = v),
        },
        {
          kind: 'select',
          label: 'Theme',
          value: theme.setting,
          options: THEMES,
          onChange: (v) => (theme.setting = v as ThemeSetting),
        },
      ]}
    />
  </div>
  <!-- Tabs: the tree keeps its full height, which the virtualization exists for. -->
  <div class="tabs" role="tablist">
    <button
      role="tab"
      id="runespect-tab-tree"
      data-tab="tree"
      aria-controls="runespect-tabpanel"
      aria-selected={tab === 'tree'}
      class:active={tab === 'tree'}
      onclick={() => (tab = 'tree')}>Tree</button
    >
    <button
      role="tab"
      id="runespect-tab-history"
      data-tab="history"
      aria-controls="runespect-tabpanel"
      aria-selected={tab === 'history'}
      class:active={tab === 'history'}
      onclick={() => (tab = 'history')}
      >History{commits.length ? ` (${commits.length})` : ''}</button
    >
  </div>
  <div
    class="tabpanel"
    role="tabpanel"
    id="runespect-tabpanel"
    aria-labelledby="runespect-tab-{tab}"
  >
    {#if tab === 'tree' && prefs.onlyStateful}
      <StateFilterChip onClear={() => (prefs.onlyStateful = false)} />
    {/if}
    {#if tab === 'history'}
      <Split bind:pct={historySplit} label="Resize the commit list and its detail">
        {#snippet left()}
          <PaneBoundary name="history" {onError}>
            <History
              {commits}
              truncated={historyTruncated}
              {selectedId}
              bind:onlySelected={historyOnlySelected}
              bind:selectedSeq={historySeq}
            />
          </PaneBoundary>
        {/snippet}
        {#snippet right()}
          <PaneBoundary name="commit" {onError}>
            <CommitDetail
              commit={selectedCommit}
              onSelect={(id) => {
                selectedId = id;
                onHover(id);
              }}
            />
          </PaneBoundary>
        {/snippet}
      </Split>
    {:else}
      <Split bind:pct={splitPct} label="Resize tree and detail panes">
        {#snippet left()}
          <PaneBoundary name="tree" {onError}>
            <Tree
              {nodes}
              sent={held.sent}
              {selectedId}
              {onEdit}
              {onHover}
              {onLog}
              {onCopy}
              {onStoreGlobal}
              onSelect={(id) => (selectedId = id)}
              {onInspect}
              filter={search.query}
              onlyStateful={prefs.onlyStateful}
              {exclude}
              flash={prefs.flash}
              {openInEditor}
              namesOnly
            />
          </PaneBoundary>
        {/snippet}
        {#snippet right()}
          <PaneBoundary name="detail" {onError}>
            <Detail
              node={selectedNode}
              sent={selectedSent}
              {openInEditor}
              expandValues={prefs.expandValues}
              {onEdit}
              {onCopy}
              {onStoreGlobal}
              {onLog}
              {onInspect}
            />
          </PaneBoundary>
        {/snippet}
      </Split>
    {/if}
  </div>
</div>

<style>
  .tabpanel {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  .runespect-panel {
    font:
      12px/1.5 ui-monospace,
      monospace;
    color: var(--rs-fg);
    background: var(--rs-bg);
    /* A full-height flex column so the tree gets a bounded scroll viewport to virtualize in
       (see <Tree>'s .rs-viewport) instead of growing the document. */
    height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 8px;
  }
  .status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    align-items: baseline;
    margin-bottom: 8px;
    padding: 4px 8px;
    background: #5a3a00;
    color: #ffd479;
    border: 1px solid #7a5200;
    border-radius: 3px;
  }
  .status-label {
    font-weight: bold;
  }
  .status-bar a {
    color: inherit;
  }
  .sources {
    position: absolute;
    right: 8px;
    margin-top: 4px;
    list-style: none;
    padding: 4px;
    background: var(--rs-bg-elev);
    border: 1px solid var(--rs-border);
    border-radius: 3px;
    z-index: 10;
  }
  .sources button {
    display: flex;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 2px 4px;
    text-align: left;
    white-space: nowrap;
  }
  .sources button:hover {
    background: var(--rs-bg);
  }
  .sources .seen {
    color: var(--rs-muted);
    margin-left: auto;
  }
  .source {
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    padding: 0;
    cursor: pointer;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }
  .status-chip {
    align-self: center;
    padding: 0 6px;
    color: var(--rs-muted);
    border: 1px solid var(--rs-border);
    border-radius: 8px;
    white-space: nowrap;
  }
  .toolbar {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    flex: 0 0 auto;
  }
  .tabs {
    display: flex;
    gap: 2px;
    flex: 0 0 auto;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--rs-border-soft);
  }
  .tabs button {
    background: transparent;
    color: var(--rs-muted);
    border: none;
    border-bottom: 2px solid transparent;
    font: inherit;
    padding: 2px 8px;
    cursor: pointer;
  }
  .tabs button.active {
    color: var(--rs-fg);
    border-bottom-color: var(--rs-accent);
  }
  .search-count {
    color: var(--rs-muted);
    white-space: nowrap;
    align-self: center;
  }
  .search {
    flex: 1;
    min-width: 6em;
    box-sizing: border-box;
    padding: 2px 6px;
    background: var(--rs-bg-elev);
    color: var(--rs-fg);
    border: 1px solid var(--rs-border);
    font: inherit;
  }
  .pick {
    background: transparent;
    color: inherit;
    border: 1px solid var(--rs-border);
    cursor: pointer;
    white-space: nowrap;
  }
  /* A real app's route is long: it gives way to the filters and ends in an ellipsis. */
  .source-chip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pick.active {
    background: var(--rs-accent);
    color: var(--rs-on-accent);
    border-color: var(--rs-accent);
  }
</style>
