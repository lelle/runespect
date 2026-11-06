import type { SourceIdentity } from './protocol/internal';

// A page's link to the panels that hear it, as steps a test can play: what the page hears, and what
// it does in answer. connect() in transport.svelte.ts is the shell that carries the effects out.
// Commands (edit, highlight, pick, …) are not part of the link: they are carried out in every mode.

export type Link =
  /** No panel has spoken to it: its first hello, and commands, only. */
  | { mode: 'quiet' }
  /** Says hello again when its url or title changes. */
  | { mode: 'watched'; announced: SourceIdentity }
  /** As watched, plus ops for every flush that changed something. */
  | { mode: 'following'; announced: SourceIdentity }
  /** Disconnected: the shell no longer listens, and nothing the link is told does anything. */
  | { mode: 'ended' };

export type LinkEvent =
  /** A request for this page or for every page; one for another page never reaches the link. */
  | { type: 'request'; toSelf: boolean; page: SourceIdentity }
  /** The url or title as they are now. */
  | { type: 'page'; page: SourceIdentity }
  | { type: 'flush'; changed: boolean }
  | { type: 'disconnect' };

export type LinkEffect =
  | { do: 'hello'; page: SourceIdentity }
  | { do: 'tree' }
  | { do: 'ops' }
  | { do: 'follow-flushes' }
  | { do: 'watch-page' }
  | { do: 'stop' };

export interface LinkStep {
  link: Link;
  effects: LinkEffect[];
}

const hello = (page: SourceIdentity): LinkEffect => ({ do: 'hello', page });

// Announced on connect rather than only when asked: a panel that was already open sent its one
// `request` before this page existed.
export function startLink(page: SourceIdentity): LinkStep {
  return { link: { mode: 'quiet' }, effects: [hello(page)] };
}

export function linkStep(link: Link, event: LinkEvent): LinkStep {
  if (link.mode === 'ended') return { link, effects: [] };
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
          ],
        };
      }
      return {
        link: { mode: 'watched', announced: event.page },
        effects: [hello(event.page), { do: 'watch-page' }],
      };
    }
    case 'page': {
      const { url, title } = event.page;
      if (link.mode === 'quiet') return { link, effects: [] };
      if (url === link.announced.url && title === link.announced.title)
        return { link, effects: [] };
      return { link: { ...link, announced: event.page }, effects: [hello(event.page)] };
    }
    case 'flush':
      return { link, effects: link.mode === 'following' && event.changed ? [{ do: 'ops' }] : [] };
    case 'disconnect':
      return { link: { mode: 'ended' }, effects: [{ do: 'stop' }] };
    default: {
      const unknown: never = event;
      return unknown;
    }
  }
}
