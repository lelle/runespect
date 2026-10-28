// Pure flash-on-update detection: which value symbols changed between two renders of a node.
// First sight of a node (no previous values) never flashes, so a freshly-mounted tree is calm.
// Used by <Tree> to blink only the values that actually changed (no false blinks).
export function changedKeys(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): string[] {
  if (!prev) return [];
  const changed: string[] = [];
  for (const key of Object.keys(next)) {
    if (!valueEqual(prev[key], next[key])) changed.push(key);
  }
  return changed;
}

function valueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
