// What the e2e scripts share: starting a dev server and waiting for it, and
// reporting checks as ✓/✗ lines.
import { spawn } from 'node:child_process';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Polls `url` until it answers, every 250 ms; throws once `tries` polls have gone unanswered. */
export async function waitForUrl(url: string, tries = 120): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`nothing answered at ${url}`);
}

// pnpm runs the server as a child of its own, and a signal to pnpm does not reach it. Each server
// therefore gets a process group, and stopping one signals the whole group. The groups still
// running when this process ends, or is interrupted, are stopped too.
const running = new Set<number>();
const stopGroup = (pid: number): void => {
  running.delete(pid);
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // already gone
  }
};
let cleanupInstalled = false;
function installCleanup(): void {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  process.on('exit', () => running.forEach(stopGroup));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => process.exit(signal === 'SIGINT' ? 130 : 143));
  }
}

/**
 * Runs `pnpm <args>` in `cwd`. With `keepLog`, what it prints is collected in `log`, for a check that
 * fails on the server's side. `stop()` ends the server and everything it started.
 */
export function startServer(
  args: string[],
  {
    cwd,
    env = {},
    keepLog = false,
  }: { cwd?: string; env?: Record<string, string>; keepLog?: boolean } = {},
): { log: string[]; stop: () => Promise<void> } {
  installCleanup();
  const child = spawn('pnpm', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: keepLog ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    detached: true,
  });
  const pid = child.pid;
  if (pid !== undefined) running.add(pid);
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const log: string[] = [];
  if (keepLog) {
    child.stdout?.on('data', (d) => log.push(String(d)));
    child.stderr?.on('data', (d) => log.push(String(d)));
  }
  const stop = async (): Promise<void> => {
    if (pid === undefined) return;
    stopGroup(pid);
    await exited;
  };
  return { log, stop };
}

/** ✓/✗ lines, and whether any check failed. */
export function checker() {
  let failures = 0;
  return {
    check(ok: boolean, what: string, detail?: unknown): void {
      console.log(`${ok ? '✓' : '✗'} ${what}${ok || detail === undefined ? '' : ` — ${detail}`}`);
      if (!ok) failures++;
    },
    fail(message: string): void {
      console.error(`✗ ${message}`);
      failures++;
    },
    get failures() {
      return failures;
    },
  };
}
