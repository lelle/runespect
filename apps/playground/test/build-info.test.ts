import { test, expect, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { Panel, formatBuildInfo } from '@runespect/ui/internal';
import { PROTOCOL_VERSION } from '@runespect/agent/protocol/internal';

beforeEach(() => localStorage.clear());

test('formatBuildInfo: version and build time, with the protocol version alongside', () => {
  expect(formatBuildInfo({ version: '0.1.0', builtAt: '2026-08-18T19:52:31.000Z' }, 1)).toEqual([
    'v0.1.0 · protocol v1',
    'built 2026-08-18 19:52 UTC',
  ]);
});

test('formatBuildInfo: an unbuilt (dev-server) panel says so instead of faking a timestamp', () => {
  expect(formatBuildInfo({ version: '0.1.0' }, 1)).toEqual(['v0.1.0 · protocol v1', 'dev build']);
  expect(formatBuildInfo(undefined, 2)).toEqual(['dev build · protocol v2']);
});

test('formatBuildInfo: a malformed timestamp is shown as-is rather than dropped or crashing', () => {
  const [, line] = formatBuildInfo({ version: '0.1.0', builtAt: 'not-a-date' }, 1);
  expect(line).toBe('built not-a-date');
});

function mountPanel(props: Record<string, unknown> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(Panel, {
    target,
    props: { transport: { send: () => {}, onMessage: () => () => {} }, ...props },
  });
  flushSync();
  return target;
}

const openSettings = (t: HTMLElement): void => {
  (t.querySelector('[data-testid="runespect-settings"]') as HTMLElement).click();
  flushSync();
};
const footer = (t: HTMLElement) =>
  t.querySelector('[data-testid="runespect-build-info"]') as HTMLElement;

test('the settings menu footer shows the panel build the user is running', () => {
  const target = mountPanel({
    buildInfo: { version: '0.1.0', builtAt: '2026-08-18T19:52:31.000Z' },
  });
  expect(footer(target)).toBeNull(); // only inside the dropdown
  openSettings(target);
  expect(footer(target).textContent).toContain('v0.1.0');
  expect(footer(target).textContent).toContain(`protocol v${PROTOCOL_VERSION}`);
  expect(footer(target).textContent).toContain('2026-08-18 19:52 UTC');
});

test('a panel with no injected build info still reports the protocol version', () => {
  const target = mountPanel();
  openSettings(target);
  expect(footer(target).textContent).toContain('dev build');
  expect(footer(target).textContent).toContain(`protocol v${PROTOCOL_VERSION}`);
});

test('the build-info footer is inert — it is not a settings row', () => {
  const target = mountPanel({ buildInfo: { version: '0.1.0' } });
  openSettings(target);
  expect(footer(target).querySelector('input,select,button')).toBeNull();
});
