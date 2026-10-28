// Compile a search query into a name predicate, for the panel's search and the console's find().
// `/pattern/flags` is treated as a regex; anything else is a case-insensitive substring. Returns null
// for an empty query (no filter). On an invalid regex, `error` is true and `test` matches nothing
// (the panel's field shows the error).
export interface Matcher {
  test: (name: string) => boolean;
  error: boolean;
}
export function compileMatcher(query: string): Matcher | null {
  const q = query.trim();
  if (!q) return null;
  const re = q.match(/^\/(.*)\/([a-z]*)$/i);
  if (re) {
    try {
      // g and y make test() resume where the last name matched, so they are dropped.
      const rx = new RegExp(re[1], re[2].replace(/[gy]/g, ''));
      return { test: (name) => rx.test(name), error: false };
    } catch {
      return { test: () => false, error: true };
    }
  }
  const lower = q.toLowerCase();
  return { test: (name) => name.toLowerCase().includes(lower), error: false };
}
