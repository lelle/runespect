import {
  commitFromOps,
  HISTORY_COMMITS,
  type Commit,
  type SerializedNode,
  type TreeOp,
} from './protocol/internal';

// The wire already carries a delta per flush; history is keeping them. Bounded two ways because
// commits, unlike the event log, hold the app's values: a count for predictable depth in an
// ordinary app, and a byte ceiling so one commit carrying a large list cannot eat the budget. What
// falls out is reported as `truncated` rather than quietly missing.
const HISTORY_BYTES = 4_000_000;

const freshRing = () => ({
  // Each entry carries its own measured size, so eviction never has to guess or re-measure.
  commits: [] as { commit: Commit; bytes: number }[],
  seq: 0,
  bytes: 0,
  truncated: false,
});
let ring = freshRing();

export function recordCommit(prev: Map<number, SerializedNode>, ops: TreeOp[]): Commit {
  const commit = commitFromOps(prev, ops, ++ring.seq, Date.now());
  // Measured on what we actually keep, not estimated: the values are depth-1 dehydrated already,
  // so this is the same order of work the wire pays anyway.
  const bytes = JSON.stringify(commit).length;
  ring.commits.push({ commit, bytes });
  ring.bytes += bytes;
  while (ring.commits.length > HISTORY_COMMITS || ring.bytes > HISTORY_BYTES) {
    const dropped = ring.commits.shift();
    if (!dropped) break;
    ring.bytes -= dropped.bytes;
    ring.truncated = true;
  }
  return commit;
}

/** The commits the agent still holds, newest last. Bounded — see HISTORY_COMMITS/HISTORY_BYTES. */
export function commits(): Commit[] {
  return ring.commits.map((h) => h.commit);
}

/** The commits after `seq`, for a panel catching up and for the console. */
export function commitsSince(seq: number): Commit[] {
  return ring.commits.filter((h) => h.commit.seq > seq).map((h) => h.commit);
}

// The wire is lazy (depth 1): deep values are dehydrated and fetched on demand via inspect/hydrate.

/** Whether commits fell out of the ring, which a panel shows instead of a silent gap. */
export function historyTruncated(): boolean {
  return ring.truncated;
}

export function resetHistory(): void {
  ring = freshRing();
}
