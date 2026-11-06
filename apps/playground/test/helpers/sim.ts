import { linkStep, startLink, type Link, type LinkEffect } from '@runespect/agent/internal';
import {
  helloMessage,
  historyMessage,
  opsMessage,
  treeMessage,
  PROTOCOL_VERSION,
  type ToPageMessage,
  type ToPanelMessage,
} from '@runespect/agent/protocol/internal';
import {
  EMPTY,
  follow,
  followedIdOf,
  hold,
  panelHeard,
  startFollowing,
  type Following,
  type FollowStep,
  type Gap,
  type Held,
  type Numbers,
} from '@runespect/ui/internal';
import { node } from './panel';

// Pages and one panel on one bus, with no browser: each tab runs the agent's Link reducer and the
// panel runs panelHeard, the steps <Panel> takes; only the I/O around them is made up here. The bus
// keeps each sender's messages in order, as the dev server's socket does, and can lose what a page
// sends. After every step the invariants are checked, and the first one broken throws with the step
// that broke it.

interface Tab {
  id: string;
  url: string;
  link: Link;
  /** The n of its last message. */
  sent: number;
  /** The app's one value, and the commit of its last change while followed. */
  value: number;
  commit: number;
  watching: boolean;
  askedByName: boolean;
  alive: boolean;
}

interface PanelSide {
  following: Following;
  numbers: Numbers;
  repairs: ReadonlyMap<string, number>;
  held: Held;
}

export interface SimOptions {
  seed?: number;
  /** The chance that a message from a page is lost on the way. */
  loss?: number;
}

/** mulberry32: a few lines, no dependency, the same sequence for the same seed. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(options: SimOptions = {}) {
  const rand = random(options.seed ?? 1);
  let loss = options.loss ?? 0;
  const tabs: Tab[] = [];
  const up = new Map<string, ToPanelMessage[]>();
  const down = new Map<string, ToPageMessage[]>();
  const gaps: Gap[] = [];
  const log: string[] = [];
  let panel: PanelSide | null = null;
  let clock = 0;
  let loads = 0;
  const loseNext = new Set<string>();
  /** Pages a message was lost from: a gap from any other page is a bug. */
  const lostFrom = new Set<string>();
  let forever: (() => void) | null = null;

  const value = (tab: Tab) => node(1, 'App', { count: tab.value });

  function pageSends(tab: Tab, msg: ToPanelMessage): void {
    const stamped = { ...msg, from: tab.id, n: ++tab.sent };
    // With no panel to hear it, nothing is lost: the message goes nowhere.
    if (!panel) return;
    if (loseNext.delete(tab.id) || (loss && rand() < loss)) {
      lostFrom.add(tab.id);
      log.push(`  lost ${msg.kind} n${stamped.n} from ${tab.id}`);
      return;
    }
    up.get(tab.id)!.push(stamped);
  }

  function perform(tab: Tab, effect: LinkEffect): void {
    if (effect.do === 'hello') {
      pageSends(tab, helloMessage(PROTOCOL_VERSION, 0, effect.page));
    } else if (effect.do === 'tree') pageSends(tab, treeMessage([value(tab)]));
    else if (effect.do === 'ops') {
      pageSends(tab, opsMessage([{ op: 'update', node: value(tab) }], tab.commit, clock));
    } else if (effect.do === 'follow-flushes') tab.watching = true;
    else if (effect.do === 'stop') tab.watching = false;
  }

  function linkHears(tab: Tab, event: Parameters<typeof linkStep>[1]): void {
    const step = linkStep(tab.link, event);
    tab.link = step.link;
    step.effects.forEach((effect) => perform(tab, effect));
  }

  function pageHears(tab: Tab, msg: ToPageMessage): void {
    if (msg.to && msg.to !== tab.id) return;
    if (msg.kind === 'request') {
      if (msg.to) tab.askedByName = true;
      linkHears(tab, { type: 'request', toSelf: !!msg.to, page: { url: tab.url, title: tab.url } });
    } else if (msg.kind === 'history-request') pageSends(tab, historyMessage([], false));
  }

  function panelSends(messages: ToPageMessage[]): void {
    for (const msg of messages) {
      // No tab is asked by name unless the panel follows it.
      if (msg.kind === 'request' && msg.to && followedIdOf(panel!.following) !== msg.to) {
        throw new Error(`the panel asked ${msg.to} by name while following ${followed()}`);
      }
      for (const tab of tabs) if (tab.alive) down.get(tab.id)!.push(msg);
    }
  }

  // As <Panel> applies a step: the new focus, what it asks, and what it shows.
  function panelApplies(step: FollowStep): void {
    const p = panel!;
    p.following = step.state;
    if (step.switched) p.held = EMPTY;
    panelSends(step.send);
    const shown = step.deliver;
    // As <Panel> does: an empty tree does not blank one it already holds.
    if (shown?.kind === 'tree' && (shown.nodes.length || p.held.sent.length === 0))
      p.held = hold(p.held, { type: 'tree', nodes: shown.nodes }).state;
    else if (shown?.kind === 'ops') {
      p.held = hold(p.held, { type: 'ops', ops: shown.ops, commit: shown.commit, t: 0 }).state;
    }
  }

  function panelHears(msg: ToPanelMessage): void {
    const p = panel!;
    const step = panelHeard(p.following, p.numbers, p.repairs, msg, ++clock);
    p.numbers = step.numbers;
    p.repairs = step.repairs;
    if (step.gap) gaps.push(step.gap);
    panelApplies(step);
  }

  const followed = (): string | null => (panel ? followedIdOf(panel.following) : null);
  const rows = (): string[] => panel?.following.sources.map((s) => s.id) ?? [];
  const alive = (): Tab[] => tabs.filter((t) => t.alive);
  const tab = (id: string): Tab => tabs.find((t) => t.id === id)!;

  function check(): void {
    const f = followed();
    if (f && !rows().includes(f)) throw new Error(`the panel follows ${f}, which is not listed`);
    for (const t of tabs) {
      if (t.link.mode === 'following' && !t.askedByName)
        throw new Error(`${t.id} follows without being asked by name`);
    }
    const unexplained = gaps.find((g) => !lostFrom.has(g.from));
    if (unexplained) throw new Error(`a gap with nothing lost: ${JSON.stringify(unexplained)}`);
  }

  function act(what: string, run: () => void): void {
    log.push(what);
    try {
      run();
      check();
    } catch (e) {
      throw new Error(`${(e as Error).message}\nafter:\n${log.join('\n')}`, { cause: e });
    }
  }

  function connectTab(url: string): Tab {
    const t: Tab = {
      id: `t${++loads}`,
      url,
      link: { mode: 'quiet' },
      sent: 0,
      value: 0,
      commit: 0,
      watching: false,
      askedByName: false,
      alive: true,
    };
    tabs.push(t);
    up.set(t.id, []);
    down.set(t.id, []);
    const start = startLink({ url, title: url });
    t.link = start.link;
    start.effects.forEach((effect) => perform(t, effect));
    return t;
  }

  function die(t: Tab): void {
    t.alive = false;
    linkHears(t, { type: 'disconnect' });
    down.set(t.id, []);
  }

  const queues = (): { from: string; to: 'panel' | Tab }[] => [
    ...[...up].filter(([, q]) => q.length).map(([from]) => ({ from, to: 'panel' as const })),
    ...alive()
      .filter((t) => down.get(t.id)!.length)
      .map((t) => ({ from: 'panel', to: t })),
  ];

  function deliver(pick = 0): boolean {
    const all = queues();
    if (!all.length) return false;
    const { from, to } = all[pick % all.length];
    if (to === 'panel') {
      const msg = up.get(from)!.shift()!;
      act(`  ${from} → panel: ${msg.kind} n${msg.n}`, () => panelHears(msg));
    } else {
      const msg = down.get(to.id)!.shift()!;
      act(`  panel → ${to.id}: ${msg.kind}${msg.to ? ` to ${msg.to}` : ''}`, () =>
        pageHears(to, msg),
      );
    }
    return true;
  }

  const api = {
    log,
    gaps,
    open(url = '/'): string {
      let id = '';
      act(`open ${url}`, () => (id = connectTab(url).id));
      return id;
    },
    openPanel(opts: { rememberedUrl?: string; waitForUrl?: boolean } = {}): void {
      act('open the panel', () => {
        const start = startFollowing({
          rememberedUrl: opts.rememberedUrl ?? null,
          waitForUrl: opts.waitForUrl ?? false,
        });
        panel = { following: start.state, numbers: new Map(), repairs: new Map(), held: EMPTY };
        panelSends(start.send);
      });
    },
    change(id: string): void {
      const t = tab(id);
      act(`change ${id}`, () => {
        t.value++;
        if (!t.watching) return;
        t.commit++;
        linkHears(t, { type: 'flush', changed: true });
      });
    },
    navigate(id: string, url: string): void {
      const t = tab(id);
      act(`navigate ${id} to ${url}`, () => {
        t.url = url;
        linkHears(t, { type: 'page', page: { url, title: url } });
      });
    },
    /** A new page load in the same tab: a new id, the same url. */
    reload(id: string): string {
      const old = tab(id);
      let next = '';
      act(`reload ${id}`, () => {
        die(old);
        next = connectTab(old.url).id;
      });
      return next;
    },
    close(id: string): void {
      act(`close ${id}`, () => die(tab(id)));
    },
    pick(id: string): void {
      act(`pick ${id}`, () =>
        panelApplies(follow(panel!.following, { type: 'pick', id }, ++clock)),
      );
    },
    deliver,
    /** Delivers until nothing is in flight. */
    settle(): void {
      for (let i = 0; i < 10_000; i++) {
        forever?.();
        if (!deliver()) return;
      }
      throw new Error(`the simulation never settled\n${log.slice(-40).join('\n')}`);
    },
    /** Runs before every delivery: traffic that never ends, to show settle() says so. */
    forever: (run: () => void) => void (forever = run),
    /** Stops losing messages, has the followed page change once so a lost last message shows, and settles. */
    heal(): void {
      loss = 0;
      api.settle();
      const f = followed();
      if (f && tab(f).alive) api.change(f);
      api.settle();
    },
    /** After settling: one row per tab that lives, and none for a tab that went. */
    rowsMatchTabs(): string | null {
      const listed = new Set(rows());
      const missing = alive().filter((t) => !listed.has(t.id));
      const stale = [...listed].filter((id) => !tab(id).alive);
      if (!missing.length && !stale.length) return null;
      return `missing ${missing.map((t) => t.id).join(',')}; stale ${stale.join(',')}`;
    },
    get followed() {
      return followed();
    },
    get rows() {
      return rows();
    },
    /** The count the panel shows for the page it follows. */
    get shown(): unknown {
      return panel?.held.sent.find((n) => n.id === 1)?.values.count;
    },
    value: (id: string) => tab(id).value,
    mode: (id: string) => tab(id).link.mode,
    /** The next message this tab sends is lost on the way. */
    loseNext: (id: string) => void loseNext.add(id),
    alive: (id: string) => tab(id).alive,
    get tabs() {
      return alive().map((t) => t.id);
    },
    rand,
  };
  return api;
}
