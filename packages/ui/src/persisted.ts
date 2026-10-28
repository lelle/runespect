// Best-effort settings persistence. Reads/writes JSON under a namespaced localStorage key,
// resilient to storage being unavailable (private mode, disabled, quota) or holding corrupt JSON —
// a failed read returns the fallback, a failed write is silently dropped. Settings are a nicety, not
// correctness-critical, so we never throw on the UI path. Used by <Panel> for sticky prefs.

const PREFIX = 'runespect:';

// The storage is shared with the app's origin and outlives versions of runespect, so a stored value
// is used only when `valid` accepts it: by default, when it has the fallback's type.
export function loadSetting<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => boolean = (value) => typeof value === typeof fallback,
): T {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting<T>(key: string, value: T): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable / quota exceeded — settings are best-effort, so drop silently */
  }
}
