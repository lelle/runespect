# Privacy

runespect is a developer tool. It shows the components and state of the Svelte app you are building,
in your own browser, and sends nothing anywhere.

## What the browser extension reads

- **The page you inspect.** On every page, one content script passes runespect's own messages
  between the page and the extension, and a second one, in the page's own context, reads the
  component names and source locations Svelte attaches to elements in a development build. When the
  app uses the runespect Vite plugin, the page itself reports its components and their values. The
  extension carries what the page reports to the runespect tab in Chrome DevTools, and nowhere else.
  It changes a value in the page only when you edit one in that tab.
- **Nothing else.** It reads no other tabs, no browsing history, no cookies, no form input and no
  network traffic.

## What it stores

- **Panel settings** (theme, filters, pane sizes) in the extension's own local storage, on your
  computer. The panel window and the in-page overlay keep the same settings in the storage of the
  app's own origin.
- **A short event log** (which kind of message crossed, how large, when) in the inspected page, as
  `window.__runespect`, for troubleshooting. It holds no values from your app, and it is gone when
  you close or reload the page.

## What it sends

Nothing. The extension makes no network requests, has no analytics or crash reporting, and loads no
remote code. "Open in editor" hands a file path to the editor on your computer, and only when you
choose it.

## The website

The project site at <https://lelle.github.io/runespect/> counts page views with
[GoatCounter](https://www.goatcounter.com/help/privacy), without cookies; the numbers are private to
the maintainer. Its demo runs in your browser and sends nothing. The tool and the extension count
nothing and send nothing, as above.

## Permissions

The extension asks for no API permissions. Its content scripts run on all sites (`<all_urls>`)
because a development server can run at any address: `localhost`, a LAN address, or a staging host.
On a page without a Svelte development build they find nothing and stay quiet.

## Contact

Questions and reports: open an issue at <https://github.com/lelle/runespect/issues>.
