import { test, expect, vi, beforeEach } from 'vitest';
import { mount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as agent from '@runespect/agent/internal';
import { Inspect } from '@runespect/ui/internal';

// The overlay is @runespect/ui in the app, but its agent is the plugin's. Another version of the
// agent may lack what this overlay calls, so the overlay says so instead of failing; an agent from
// 0.1.0 reports no version at all.
let agentVersion: string | undefined;
vi.mock('@runespect/agent/internal', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    get version() {
      return agentVersion;
    },
  };
});

const uiVersion: string = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../../../packages/ui/package.json'), 'utf8'),
).version;

beforeEach(() => {
  document.body.innerHTML = '';
  agent.reset();
});

function overlayWith(version: string | undefined): ShadowRoot {
  agentVersion = version;
  const target = document.body.appendChild(document.createElement('div'));
  mount(Inspect, { target });
  flushSync();
  return target.querySelector('[data-testid="runespect-overlay-host"]')!.shadowRoot!;
}

test('next to an agent of another version, the overlay says so instead of showing the tree', () => {
  const overlay = overlayWith('0.0.9');

  expect(overlay.querySelector('[data-testid="runespect-version-skew"]')?.textContent).toContain(
    `@runespect/ui ${uiVersion}`,
  );
  expect(overlay.querySelector('[data-testid="runespect-version-skew"]')?.textContent).toContain(
    '0.0.9',
  );
  expect(overlay.querySelector('[data-component]')).toBeNull();
});

test('an agent that reports no version is from before 0.1.1', () => {
  const overlay = overlayWith(undefined);

  expect(overlay.querySelector('[data-testid="runespect-version-skew"]')?.textContent).toContain(
    'older than 0.1.1',
  );
});

test('next to its own version, the overlay shows no such notice', () => {
  const overlay = overlayWith(uiVersion);

  expect(overlay.querySelector('[data-testid="runespect-version-skew"]')).toBeNull();
});
