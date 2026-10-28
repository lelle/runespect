// Panel build identity, shown in the settings-menu footer. The version and build time can only be
// known at build time, so the host injects them (see the extension's vite define) and <Panel> takes
// them as a prop — a build-time global would break the two consumers that are not the extension
// build: the dev harness and the unit tests.

export interface BuildInfo {
  version: string;
  /** ISO-8601 UTC, stamped when the panel bundle was built. Absent when served from a dev server. */
  builtAt?: string;
}

// `2026-08-18T19:52:31.000Z` → `2026-08-18 19:52 UTC`. Kept in UTC rather than local time so the
// string is unambiguous when it ends up pasted into a bug report.
function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso; // not a date we understand — show it rather than hide it
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// One or two display lines: identity first, build time second. A panel with no injected info is a
// dev build, and says so instead of implying a release.
export function formatBuildInfo(info: BuildInfo | undefined, protocolVersion: number): string[] {
  const protocol = `protocol v${protocolVersion}`;
  if (!info) return [`dev build · ${protocol}`];
  return [
    `v${info.version} · ${protocol}`,
    info.builtAt ? `built ${formatTimestamp(info.builtAt)}` : 'dev build',
  ];
}
