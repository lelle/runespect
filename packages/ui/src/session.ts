import type { ToPageMessage, ToPanelMessage } from '@runespect/agent/protocol/internal';
import { follow, type Following, type FollowStep } from './follow';
import type { Gap } from './numbering';
import { panelHeard, panelStep, repairDue, type HeardStep, type PanelSide } from './panel-step';

// The panel's side of the conversation with the pages: what it hears goes through panelHeard,
// whatever that asks for is sent, what it shows is handed on, and the timers it asks for come back
// as steps. follow.ts and panel-step.ts decide; this carries the decisions out, in their order.
// <Panel> and the simulator in the playground's tests both take it, each with the I/O around it:
// the transport and a timer for <Panel>, a bus and a clock the test moves for the simulator.

/** What a session needs from outside it. */
export interface SessionEnv {
  /** A message for the page followed, or a request for pages. */
  send(message: ToPageMessage): void;
  /** What the page followed sent, after follow.ts has filtered it. */
  show(message: ToPanelMessage): void;
  /** The page followed changed: what the view holds of the last one goes. */
  forget(): void;
  /** A page skipped a number. */
  gap(gap: Gap): void;
  /** The focus or the pages heard changed. */
  changed(following: Following): void;
  now(): number;
  /** Calls `run` after `ms`, and returns what cancels it. */
  timer(ms: number, run: () => void): () => void;
}

export class Session {
  #side: PanelSide;
  readonly #start: readonly ToPageMessage[];
  readonly #env: SessionEnv;
  readonly #pending = new Set<() => void>();

  constructor(start: { state: Following; send: readonly ToPageMessage[] }, env: SessionEnv) {
    this.#side = { following: start.state, numbers: new Map(), repair: null };
    this.#start = start.send;
    this.#env = env;
  }

  get following(): Following {
    return this.#side.following;
  }

  /** Asks who is there. Called once the listener is in place, so no answer is missed. */
  begin(): void {
    this.#start.forEach((message) => this.#env.send(message));
  }

  /** A message from a page. */
  hear(message: ToPanelMessage): void {
    this.#heard(panelHeard(this.#side, message, this.#env.now()));
  }

  /** The user picks a page. */
  pick(id: string): void {
    this.#heard(panelStep(this.#side, { type: 'pick', id }, this.#env.now()));
  }

  /** A command for the page followed, addressed by follow.ts. */
  command(message: ToPageMessage): void {
    this.#apply(follow(this.#side.following, { type: 'command', msg: message }, this.#env.now()));
  }

  /** Ends every timer that waits. */
  dispose(): void {
    this.#pending.forEach((cancel) => cancel());
    this.#pending.clear();
  }

  #heard(step: HeardStep): void {
    this.#side = step.side;
    // To gap and not to a console: the panel can run in the inspected page.
    if (step.gap) this.#env.gap(step.gap);
    if (step.repairAt !== null) {
      this.#later(step.repairAt, () => this.#heard(repairDue(this.#side, this.#env.now())));
    }
    this.#apply(step);
  }

  #apply(step: FollowStep): void {
    this.#side = { ...this.#side, following: step.state };
    this.#env.changed(step.state);
    if (step.switched) this.#env.forget();
    for (const message of step.send) this.#env.send(message);
    if (step.deliver) this.#env.show(step.deliver);
    for (const { id, at } of step.timers) {
      this.#later(at, () =>
        this.#heard(panelStep(this.#side, { type: 'timeout', id }, this.#env.now())),
      );
    }
  }

  // A page that said bye is kept for a wait; follow.ts says when it ends, the clock keeps the time.
  #later(at: number, run: () => void): void {
    const cancel = this.#env.timer(Math.max(0, at - this.#env.now()), () => {
      this.#pending.delete(cancel);
      // Early by the clock (it stepped back, or the timer ran a little early): not due yet.
      if (this.#env.now() < at) this.#later(at, run);
      else run();
    });
    this.#pending.add(cancel);
  }
}
