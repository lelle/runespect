import type { Commit, Change } from '@runespect/agent/protocol/internal';

// Pure view logic for the history tab, so the rules are testable without a DOM.

/** Newest first: the question is almost always "what happened just now", not "what happened first".
 *  Takes commits in ascending seq order, which is what mergeCommits returns, so it reverses rather
 *  than sorts — this recomputes on every flush while the tab is open. */
export function newestFirst(commits: Commit[]): Commit[] {
  return [...commits].reverse();
}

// Merge the backlog the agent sent with what the panel already built from the live stream. Keyed by
// seq, because the same commit can arrive both ways: it is in the agent's ring AND on the ops
// message that produced it.
export function mergeCommits(existing: Commit[], incoming: Commit[], limit: number): Commit[] {
  const trim = (all: Commit[]): Commit[] =>
    all.length > limit ? all.slice(all.length - limit) : all;
  // The live case is one commit newer than everything we hold, which happens on every flush — an
  // append, not a merge. The Map-and-sort is for the backlog, which arrives twice per session.
  const newest = existing.at(-1)?.seq ?? -Infinity;
  if (incoming.every((c) => c.seq > newest)) return trim(existing.concat(incoming));

  const bySeq = new Map(existing.map((c) => [c.seq, c]));
  for (const c of incoming) bySeq.set(c.seq, c);
  return trim([...bySeq.values()].sort((a, b) => a.seq - b.seq));
}

/** Only the commits touching one component — "what happened to this" while it is selected. */
export function forNode(commits: Commit[], id: number | null): Commit[] {
  if (id == null) return commits;
  const filtered: Commit[] = [];
  for (const c of commits) {
    const changes = c.changes.filter((ch) => ch.id === id);
    if (!changes.length) continue;
    // Keep the original object when nothing was filtered out: the list is keyed by commit, so a new
    // object per commit would re-render every row on every flush.
    filtered.push(changes.length === c.changes.length ? c : { ...c, changes });
  }
  return filtered;
}

/** What a change is called: `Counter.count`, or just the component for a mount/unmount. */
export function changeLabel(change: Change): string {
  return change.symbol ? `${change.name}.${change.symbol}` : change.name;
}

/** Stable key for test selectors and {#each}: distinguishes a mount from a change to a value. */
export function changeKey(change: Change): string {
  return `${change.name}.${change.symbol ?? change.op}`;
}

/** Commit timestamps in local time, shown the same way in the list and in the detail pane. */
export function formatCommitTime(t: number): string {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
