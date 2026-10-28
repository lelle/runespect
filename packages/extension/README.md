# @runespect/extension

The runespect panel as a tab in Chrome DevTools. To install and use it, see
[Use the browser extension](../../docs/how-to/use-the-extension.md). This page is for working on it.

## Development

| File                   | Role                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `manifest.json`        | MV3 manifest; the version comes from `package.json` at build time (`vite.config.ts`)  |
| `src/content.ts`       | The relay (`src/relay.ts`)                                                            |
| `src/content-main.ts`  | The DOM walk for pages without the plugin (`src/dom-walk.ts`, `src/content-tier1.ts`) |
| `src/background.ts`    | The service worker: routes messages by tab (`src/routing.ts`)                         |
| `src/devtools.ts`      | Creates the runespect tab                                                             |
| `src/panel.ts`         | Connects to the service worker (`src/panel-port.ts`) and mounts the panel             |
| `icons/icon.png`       | The icon from 48 px; `public/icons/icon-*.png` are rendered from it                   |
| `icons/icon-small.png` | The icon at 16 and 32 px: the rune alone                                              |

The built manifest lists the content scripts' code chunks under `web_accessible_resources`, so the
scripts can load them.

The relay, the routing, the panel port and the DOM walk have unit tests in
`apps/playground/test`. `pnpm test:extension` loads the built extension in Chromium and checks
the event log, the version and the icon; it needs the e2e dev server on port 5187 and a display.

Every hop between the page and the panel records what crossed it; `window.__runespect` in the
inspected page shows the timeline ([Event log](../../docs/reference/event-log.md)).
