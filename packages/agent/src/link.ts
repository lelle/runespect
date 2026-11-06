import type { SourceIdentity } from './protocol/internal';

// A page's link to the panels that hear it, as steps a test can play: what the page hears, and what
// it does in answer. connect() in transport.svelte.ts is the shell that carries the effects out.
// Commands (edit, highlight, pick, …) are not part of the link: they are carried out in every mode.

export type Link =
  /** No panel has spoken to it: its first hello, and commands, only. */
  | { mode: 'quiet' }
  /** Says hello again when its url, title or visibility changes, keeps its id in the tab, says bye. */
  | { mode: 'watched'; announced: SourceIdentity }
  /** As watched, plus ops for every flush that changed something. */
  | { mode: 'following'; announced: SourceIdentity }
  /** Said bye: silent until it comes back from the back/forward cache, as what it was. */
  | { mode: 'away'; back: 'watched' | 'following'; announced: SourceIdentity }
  /** Disconnected: the shell no longer listens, and nothing the link is told does anything. */
  | { mode: 'ended' };

export type LinkEvent =
  /** A request for this page or for every page; one for another page never reaches the link. */
  | { type: 'request'; toSelf: boolean; page: SourceIdentity }
  /** A ping for this page. */
  | { type: 'ping'; page: SourceIdentity }
  /** The url, title and visibility as they are now. */
  | { type: 'page'; page: SourceIdentity }
  | { type: 'flush'; changed: boolean }
  /** The page is going: a reload, a close, navigating away, or into the back/forward cache. */
  | { type: 'pagehide' }
  /** Back from the back/forward cache. */
  | { type: 'pageshow'; page: SourceIdentity }
  | { type: 'disconnect' };

export type LinkEffect =
  | { do: 'hello'; page: SourceIdentity; replaces?: string }
  | { do: 'tree' }
  | { do: 'ops' }
  | { do: 'follow-flushes' }
  | { do: 'watch-page' }
  /** Keep this page's id in the tab, so the page after it can say it replaces this one. */
  | { do: 'remember' }
  | { do: 'bye' }
  | { do: 'stop' };

export interface LinkStep {
  link: Link;
  effects: LinkEffect[];
}

const hello = (page: SourceIdentity): LinkEffect => ({ do: 'hello', page });
const same = (a: SourceIdentity, b: SourceIdentity): boolean =>
  a.url === b.url && a.title === b.title && a.visible === b.visible;

// Announced on connect rather than only when asked: a panel that was already open sent its one
// `request` before this page existed. A tab a panel watched before (`previous`, from the tab's
// sessionStorage) is watched from the start, without waiting to be asked again.
export function startLink(page: SourceIdentity, previous: string | null = null): LinkStep {
  if (previous) {
    return {
      link: { mode: 'watched', announced: page },
      effects: [
        { do: 'hello', page, replaces: previous },
        { do: 'watch-page' },
        { do: 'remember' },
      ],
    };
  }
  return { link: { mode: 'quiet' }, effects: [hello(page)] };
}

export function linkStep(link: Link, event: LinkEvent): LinkStep {
  if (link.mode === 'ended') return { link, effects: [] };
  if (link.mode === 'away') {
    // Chrome tells a page it is hidden after pagehide: a page that said bye says nothing more.
    if (event.type === 'disconnect') return { link: { mode: 'ended' }, effects: [{ do: 'stop' }] };
    if (event.type !== 'pageshow') return { link, effects: [] };
    return {
      link: { mode: link.back, announced: event.page },
      effects: [hello(event.page), { do: 'remember' }],
    };
  }
  // Leaving quiet is when a page starts to keep its id in the tab.
  const remember: LinkEffect[] = link.mode === 'quiet' ? [{ do: 'remember' }] : [];
  switch (event.type) {
    case 'request': {
      // Asked by name, or by a panel this page already serves (a reconnect), it sends its tree.
      if (event.toSelf || link.mode === 'following') {
        return {
          link: { mode: 'following', announced: event.page },
          effects: [
            { do: 'follow-flushes' },
            { do: 'tree' },
            hello(event.page),
            { do: 'watch-page' },
            ...remember,
          ],
        };
      }
      return {
        link: { mode: 'watched', announced: event.page },
        effects: [hello(event.page), { do: 'watch-page' }, ...remember],
      };
    }
    case 'ping':
      if (link.mode !== 'quiet')
        return { link: { ...link, announced: event.page }, effects: [hello(event.page)] };
      return {
        link: { mode: 'watched', announced: event.page },
        effects: [hello(event.page), { do: 'watch-page' }, ...remember],
      };
    case 'page':
      if (link.mode === 'quiet' || same(event.page, link.announced)) return { link, effects: [] };
      return { link: { ...link, announced: event.page }, effects: [hello(event.page)] };
    case 'flush':
      return { link, effects: link.mode === 'following' && event.changed ? [{ do: 'ops' }] : [] };
    case 'pagehide':
      if (link.mode === 'quiet') return { link, effects: [] };
      return {
        link: { mode: 'away', back: link.mode, announced: link.announced },
        effects: [{ do: 'bye' }],
      };
    // Only an away page comes back from the back/forward cache with something to say.
    case 'pageshow':
      return { link, effects: [] };
    case 'disconnect':
      return { link: { mode: 'ended' }, effects: [{ do: 'stop' }] };
    default: {
      const unknown: never = event;
      return unknown;
    }
  }
}
