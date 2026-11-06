import { tierLabel } from './status';
import type { HelloMessage } from '@runespect/agent/protocol/internal';

// The pages the panel has heard, and how each is shown.
//
// One dev server is one channel: every page served by it — a second tab, an app at another route,
// islands from separate bundles — announces itself on the same bus. The panel follows exactly one
// of them; which one is follow.ts. Pure, because "why am I looking at the wrong app" is the kind of
// question that deserves a test rather than a guess.

/** Whether a page is there: said hello, said bye and may be reloading, or replaced and pinged. */
export type Life =
  | { readonly state: 'alive' }
  /** Said bye: kept for the wait, since a reload says bye before the new page says hello. */
  | { readonly state: 'left'; readonly until: number }
  /** A page in its tab says it replaces this one, which said no bye: pinged, gone if it is silent. */
  | { readonly state: 'suspect'; readonly successor: string; readonly until: number };

export interface Source {
  id: string;
  url?: string;
  title?: string;
  tier?: 0 | 2;
  /** Why a capture stopped, from its hello. */
  problem?: string;
  agentVersion?: string;
  /** Whether its tab was shown when it last said hello. */
  visible?: boolean;
  /** When we last heard from it. */
  lastSeen: number;
  life: Life;
}

/** How long a page that said bye, or was replaced without one, is kept before it is gone. */
export const WAIT_MS = 1000;

/** What a message did to the list; which page the panel follows reacts to this, never to the message. */
export type Heard =
  | { type: 'arrived'; id: string; replaces?: string }
  | { type: 'refreshed'; id: string }
  | { type: 'left'; id: string }
  | { type: 'replaced'; from: string; to: string }
  | { type: 'gone'; id: string };

export interface PeerStep {
  sources: readonly Source[];
  heard: Heard | null;
  /** Pages to ping: every page heard for the first time, and a page replaced without a bye. */
  ping: string[];
}

const alive: Life = { state: 'alive' };
const without = (sources: readonly Source[], id: string) => sources.filter((s) => s.id !== id);
const replace = (sources: readonly Source[], next: Source) =>
  sources.map((s) => (s.id === next.id ? next : s));

/** Fold a hello into the list. */
export function hearHello(
  sources: readonly Source[],
  hello: HelloMessage,
  now: number,
  oneTab = false,
): PeerStep {
  // `from` is the page's id — it is on every message it sends, so a hello needs no id of its own.
  if (!hello.from) return { sources, heard: null, ping: [] };
  const next: Source = {
    id: hello.from,
    url: hello.url,
    title: hello.title,
    tier: hello.tier,
    problem: hello.problem,
    agentVersion: hello.agentVersion,
    visible: hello.visible,
    lastSeen: now,
    life: alive,
  };
  // Known: saying hello again, back from the back/forward cache, or a copied tab's original
  // answering its ping. Each is alive.
  if (sources.some((s) => s.id === next.id)) {
    return { sources: replace(sources, next), heard: { type: 'refreshed', id: next.id }, ping: [] };
  }
  const before = hello.replaces ? sources.find((s) => s.id === hello.replaces) : undefined;
  // A panel that hears one tab knows a page in it that replaces another is its reload: no copied
  // tab to tell apart, so nothing to ask, even when the bye was lost on the way.
  if (before?.life.state === 'left' || (oneTab && before?.life.state === 'alive')) {
    return {
      sources: [...without(sources, before.id), next],
      heard: { type: 'replaced', from: before.id, to: next.id },
      ping: [next.id],
    };
  }
  if (before?.life.state === 'alive') {
    const suspect: Source = {
      ...before,
      life: { state: 'suspect', successor: next.id, until: now + WAIT_MS },
    };
    return {
      sources: [...replace(sources, suspect), next],
      heard: { type: 'arrived', id: next.id },
      ping: [next.id, before.id],
    };
  }
  return {
    sources: [...sources, next],
    heard: { type: 'arrived', id: next.id, ...(hello.replaces && { replaces: hello.replaces }) },
    ping: [next.id],
  };
}

/** A page said bye. */
export function hearBye(sources: readonly Source[], id: string, now: number): PeerStep {
  const source = sources.find((s) => s.id === id);
  if (source?.life.state === 'alive') {
    return {
      sources: replace(sources, { ...source, life: { state: 'left', until: now + WAIT_MS } }),
      heard: { type: 'left', id },
      ping: [],
    };
  }
  if (source?.life.state === 'suspect') return ended(sources, source);
  return { sources, heard: null, ping: [] };
}

/** A page's wait came due. A timer for a page that is alive again does nothing. */
export function waitEnded(sources: readonly Source[], id: string, now: number): PeerStep {
  const source = sources.find((s) => s.id === id);
  if (!source || source.life.state === 'alive' || source.life.until > now) {
    return { sources, heard: null, ping: [] };
  }
  if (source.life.state === 'left') {
    return { sources: without(sources, id), heard: { type: 'gone', id }, ping: [] };
  }
  return ended(sources, source);
}

// A replaced page that said bye, or kept silent through its wait: its successor takes its place.
function ended(sources: readonly Source[], source: Source): PeerStep {
  const rest = without(sources, source.id);
  const successor = source.life.state === 'suspect' ? source.life.successor : null;
  const heard: Heard =
    successor && rest.some((s) => s.id === successor && s.life.state === 'alive')
      ? { type: 'replaced', from: source.id, to: successor }
      : { type: 'gone', id: source.id };
  return { sources: rest, heard, ping: [] };
}

/** The deadline of each page that waits, for the view to set a timer by. */
export const deadlines = (sources: readonly Source[]): { id: string; at: number }[] =>
  sources.flatMap((s) => (s.life.state === 'alive' ? [] : [{ id: s.id, at: s.life.until }]));

// Several pages can be at one url, so a url resolves to the one heard from last.
export function latestAt(sources: readonly Source[], url: string): Source | undefined {
  return sources
    .filter((s) => s.url === url)
    .reduce<Source | undefined>(
      (latest, s) => (!latest || s.lastSeen >= latest.lastSeen ? s : latest),
      undefined,
    );
}

/** "just now" / "12s ago" / "4m ago": how long since the page last said hello. */
export function lastSeenLabel(source: Omit<Source, 'life'>, now: number): string {
  // A clock that went back gives a negative age, which reads as just now too.
  const seconds = Math.round((now - source.lastSeen) / 1000);
  if (seconds < 3) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/** What to show for a source: its path, falling back to the title, then the id. */
export function sourceLabel(source: Omit<Source, 'life'>): string {
  return source.url || source.title || source.id;
}

/** The second line of a page in the list: its title, its tier and its agent version, if it said them. */
export function sourceDetails(source: Omit<Source, 'life'>): string {
  // Without a url the title already names the row (sourceLabel), so it is not said twice.
  return [
    source.url && source.title,
    tierLabel(source.tier, source.problem),
    source.agentVersion && `v${source.agentVersion}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
