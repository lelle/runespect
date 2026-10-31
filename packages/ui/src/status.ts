// What the panel is connected to, as one line of UI. The page tells us its tier in the handshake
// (see HelloMessage.tier); a tree with no handshake behind it is the extension's names-only DOM walk,
// which yields names and source locations but no reactive state. Pure so the state machine — and
// especially the severity order — is unit-testable.

const SITE_DOCS = 'https://lelle.github.io/runespect/docs/';
export const TIER_DOCS_URL = `${SITE_DOCS}explanation/tiers/`;
export const TROUBLESHOOTING_URL = `${SITE_DOCS}how-to/troubleshoot/#nothing-at-all-in-the-panel`;

export type StatusLevel = 'ok' | 'warn' | 'waiting';

export interface PanelStatus {
  level: StatusLevel;
  /** Short chip text, always shown. */
  label: string;
  /** The explanation, shown when the panel expands the status into a bar. */
  detail?: string;
  docsUrl?: string;
  /** What the link to docsUrl says, when it says more than the default. */
  docsLabel?: string;
}

export interface StatusInput {
  /** From the page's hello: 0 = app plugin, 2 = an experimental capture. null/undefined = nobody said. */
  tier?: 0 | 2 | null;
  /** Why a capture stopped, from its hello. */
  problem?: string | null;
  /** The page's protocol version, when it differs from ours. */
  mismatchVersion?: number | null;
  panelVersion: number;
  hasTree: boolean;
  /** Whether we have waited long enough to conclude that no handshake is coming. */
  graceElapsed: boolean;
}

export function panelStatus(input: StatusInput): PanelStatus {
  // A version mismatch outranks the tier: the tree may decode wrongly, so naming a tier would be
  // reassuring about data we cannot trust.
  if (input.mismatchVersion != null) {
    return {
      level: 'warn',
      label: 'Protocol mismatch',
      detail: `page v${input.mismatchVersion}, panel v${input.panelVersion} — rebuild/reload the extension.`,
    };
  }
  if (input.tier === 0) {
    return { level: 'ok', label: 'Live', detail: "live state from the app's runespect plugin" };
  }
  // A capture reads Svelte's private runtime, which can change on any minor, and cannot edit.
  if (input.tier === 2 && input.problem) {
    return {
      level: 'warn',
      label: 'Capture stopped',
      detail: input.problem,
      docsUrl: TIER_DOCS_URL,
    };
  }
  if (input.tier === 2) {
    return {
      level: 'warn',
      label: 'Experimental',
      detail:
        "captured from Svelte's private runtime — read-only, and values can be missing or misnamed.",
      docsUrl: TIER_DOCS_URL,
    };
  }
  // A plugin page that boots slowly can lose the race to the names-only first tree, so a tier-less tree
  // only becomes a verdict once the grace period is up.
  if (input.hasTree && input.graceElapsed) {
    return {
      level: 'warn',
      label: 'Names only',
      detail: 'component names only — no live state, editing or highlight.',
      docsUrl: TIER_DOCS_URL,
      docsLabel: 'Add the plugin for live state',
    };
  }
  if (input.graceElapsed && !input.hasTree) {
    return {
      level: 'warn',
      label: 'No app',
      detail:
        'no page has answered — is it open in this browser, and does its Vite config have runespect()?',
      docsUrl: TROUBLESHOOTING_URL,
    };
  }
  return { level: 'waiting', label: 'Connecting…' };
}
