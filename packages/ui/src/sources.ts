import type { HelloMessage } from '@runespect/agent/protocol/internal';

// Which page the panel is looking at.
//
// One dev server is one channel: every page served by it — a second tab, an app at another route,
// islands from separate bundles — announces itself on the same bus. The panel follows exactly one,
// and these rules decide which. Pure, because "why am I looking at the wrong app" is the kind of
// question that deserves a test rather than a guess.

export interface Source {
  id: string;
  url?: string;
  title?: string;
  /** When we last heard from it. A quiet page and a closed one look identical on a shared bus, so
   *  this is reported as an age rather than used to declare anything dead. */
  lastSeen: number;
}

/** Fold a hello into the known sources, refreshing one we've met before rather than duplicating it. */
export function trackSources(
  sources: readonly Source[],
  hello: HelloMessage,
  now: number,
): readonly Source[] {
  // `from` is the page's id — it is on every message it sends, so a hello needs no id of its own.
  if (!hello.from) return sources;
  const next: Source = { id: hello.from, url: hello.url, title: hello.title, lastSeen: now };
  return sources.some((s) => s.id === next.id)
    ? sources.map((s) => (s.id === next.id ? next : s))
    : [...sources, next];
}

// The id to follow, in order of respect for what the user meant:
//   1. an explicit choice, while that page is still around
//   2. the url they were following before — a reload gives a new id, so the url is what survives
//   3. the first page we heard from
// A url can have several sources — the dead page stays listed after a reload — so a url resolves to
// the one heard from last. A panel opened for a url (`waitForUrl`) follows nothing else while it
// waits: a page reads nothing until a panel asks it by name, and asking another would wake it.
export function chooseSource(
  sources: readonly Source[],
  chosenId: string | null,
  rememberedUrl: string | null,
  { waitForUrl = false }: { waitForUrl?: boolean } = {},
): string | null {
  if (chosenId && sources.some((s) => s.id === chosenId)) return chosenId;
  if (rememberedUrl) {
    const byUrl = latestAt(sources, rememberedUrl);
    if (byUrl) return byUrl.id;
    if (waitForUrl) return null;
  }
  const first = sources[0];
  if (!first) return null;
  return first.url ? (latestAt(sources, first.url) ?? first).id : first.id;
}

function latestAt(sources: readonly Source[], url: string): Source | undefined {
  return sources
    .filter((s) => s.url === url)
    .reduce<Source | undefined>(
      (latest, s) => (!latest || s.lastSeen >= latest.lastSeen ? s : latest),
      undefined,
    );
}

/** "just now" / "12s ago" / "4m ago" — an age, not a verdict about whether it is alive. */
export function lastSeenLabel(source: Source, now: number): string {
  // A clock that went back gives a negative age, which reads as just now too.
  const seconds = Math.round((now - source.lastSeen) / 1000);
  if (seconds < 3) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/** What to show for a source: its path, falling back to the title, then the id. */
export function sourceLabel(source: Source): string {
  return source.url || source.title || source.id;
}
