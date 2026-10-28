import { mount } from 'svelte';
import { Panel, type BuildInfo } from '@runespect/ui/internal';
import { PANEL_PORT } from '@runespect/agent/protocol/internal';
import { startPanel } from './panel-hop.js';

// Stamped by vite's define at build time (see vite.config.ts). Declared as possibly undefined so a
// panel served some other way still compiles and falls back to "dev build".
declare const __RUNESPECT_BUILD__: BuildInfo | undefined;
const buildInfo = typeof __RUNESPECT_BUILD__ === 'undefined' ? undefined : __RUNESPECT_BUILD__;

// Connect to the background service worker, register this panel's inspected tab, and drive the
// presentational <Panel> over it. The connection re-establishes itself: MV3 retires the idle
// service worker (see panel-port.ts).
const panel = startPanel({
  connect: () => chrome.runtime.connect({ name: PANEL_PORT }),
  tabId: chrome.devtools.inspectedWindow.tabId,
  evalInPage: (expression) => chrome.devtools.inspectedWindow.eval(expression),
  schedule: requestAnimationFrame,
});

mount(Panel, {
  target: document.getElementById('app')!,
  props: { transport: panel.transport, buildInfo, onError: panel.onError },
});
