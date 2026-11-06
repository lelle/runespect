import { tierLabel } from './status';
import type { HelloMessage } from '@runespect/agent/protocol/internal';

// The pages the panel has heard, and how each is shown.
//
// One dev server is one channel: every page served by it — a second tab, an app at another route,
// islands from separate bundles — announces itself on the same bus. The panel follows exactly one
// of them; which one is follow.ts. Pure, because "why am I looking at the wrong app" is the kind of
// question that deserves a test rather than a guess.

export interface Source {
  id: string;
  url?: string;
  title?: string;
  tier?: 0 | 2;
  /** Why a capture stopped, from its hello. */
  problem?: string;
  agentVersion?: string;
  /** When we last heard from it. A quiet page and a closed one look identical on a shared bus, so
   *  this is reported as an age rather than used to declare anything dead. */
  lastSeen: number;
}

/** What a hello did to the list: a page it did not know, or one it knew saying hello again. */
export type Heard = { type: 'arrived'; id: string } | { type: 'refreshed'; id: string };

/** Fold a hello into the known sources, refreshing one we've met before rather than duplicating it. */
export function hearHello(
  sources: readonly Source[],
  hello: HelloMessage,
  now: number,
): { sources: readonly Source[]; heard: Heard | null } {
  // `from` is the page's id — it is on every message it sends, so a hello needs no id of its own.
  if (!hello.from) return { sources, heard: null };
  const next: Source = {
    id: hello.from,
    url: hello.url,
    title: hello.title,
    tier: hello.tier,
    problem: hello.problem,
    agentVersion: hello.agentVersion,
    lastSeen: now,
  };
  if (!sources.some((s) => s.id === next.id)) {
    return { sources: [...sources, next], heard: { type: 'arrived', id: next.id } };
  }
  return {
    sources: sources.map((s) => (s.id === next.id ? next : s)),
    heard: { type: 'refreshed', id: next.id },
  };
}

// A url can have several sources — the dead page stays listed after a reload — so a url resolves to
// the one heard from last.
export function latestAt(sources: readonly Source[], url: string): Source | undefined {
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

/** The second line of a page in the list: its title, its tier and its agent version, if it said them. */
export function sourceDetails(source: Source): string {
  // Without a url the title already names the row (sourceLabel), so it is not said twice.
  return [
    source.url && source.title,
    tierLabel(source.tier, source.problem),
    source.agentVersion && `v${source.agentVersion}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
