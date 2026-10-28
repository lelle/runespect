// Verifies the runtime event log with the REAL extension loaded (see
// docs/reference/event-log.md). The DevTools panel cannot be driven by a browser automation tool,
// so what this proves is the half that can be: the page-side agent publishes window.__runespect, and the
// content-script relay — which lives in an isolated world and cannot touch that global directly —
// gets its buffer mirrored in.
//
//   node e2e/extension-events.ts            (expects the e2e dev server on 5187)
//
// Bundled Chromium, not channel:'chrome': Chrome 137+ refuses --load-extension.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { checker } from './lib.ts';
import path from 'node:path';

const EXT = path.resolve('packages/extension/dist');
const URL = process.argv[2] ?? 'http://localhost:5187/';

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const checks = checker();
const { check } = checks;

try {
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const [worker] = ctx.serviceWorkers();
  check(!!worker, 'the extension is loaded (background service worker is running)');

  // What Chrome's extensions page and the store show: the package's version, and an icon.
  if (worker) {
    const shipped = await worker.evaluate(() => globalThis.chrome.runtime.getManifest());
    const pkg = JSON.parse(readFileSync('packages/extension/package.json', 'utf8'));
    check(
      shipped.version === pkg.version,
      'the extension has its package version',
      shipped.version,
    );
    const iconLoads = await worker.evaluate(
      async (file) => (await fetch(globalThis.chrome.runtime.getURL(file))).ok,
      shipped.icons?.['128'] ?? '',
    );
    check(iconLoads, 'its 128 px icon loads');
  }

  // The page sends its tree only once a panel asks it by name. The DevTools panel cannot be opened by
  // automation, so ask the way it does: learn the page from its hello, then ask that page.
  await page.evaluate(() => {
    const w = window as Window & { __rsAsked?: boolean };
    w.addEventListener('message', (e) => {
      if (e.data?.source !== 'runespect' || e.data.kind !== 'hello' || w.__rsAsked) return;
      w.__rsAsked = true;
      window.postMessage({ source: 'runespect', kind: 'request', to: e.data.from }, '*');
    });
    window.postMessage({ source: 'runespect', kind: 'request' }, '*');
  });
  await page.waitForTimeout(500);

  const log = await page.evaluate(() => {
    const api = window.__runespect;
    if (!api) return null;
    const byHop: Record<string, number> = {};
    for (const e of api.events) byHop[e.hop] = (byHop[e.hop] ?? 0) + 1;
    return { byHop, events: api.events, dump: api.dump() };
  });

  check(log !== null, 'window.__runespect is published on the inspected page');
  if (log) {
    check(log.byHop.agent > 0, 'the agent hop reports', JSON.stringify(log.byHop));
    check(
      log.byHop.relay > 0,
      'the relay hop reaches the page from its isolated world',
      JSON.stringify(log.byHop),
    );
    check(
      log.events.some((e) => e.hop === 'agent' && e.ev === 'tx' && e.kind === 'tree'),
      'a tree send is recorded with its kind',
    );
    // The log lives in a global the page itself can read, so it must not carry app data. The
    // playground's tree is full of "Counter"; the log must record that a tree crossed, not what
    // was in it.
    check(
      !log.dump.includes('Counter'),
      'events carry envelopes, not application values',
      log.dump.slice(0, 120),
    );
    check(JSON.parse(log.dump).events.length === log.events.length, 'dump() matches events');
  }
} finally {
  await ctx.close();
}

console.log(checks.failures ? `\n${checks.failures} check(s) failed` : '\nall checks passed');
process.exit(checks.failures ? 1 : 0);
