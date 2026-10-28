// Creates the "runespect" tab in Chrome DevTools, hosting panel.html.
// The tab's icon is one the manifest lists, so the two cannot point at different files.
chrome.devtools.panels.create(
  'runespect',
  chrome.runtime.getManifest().icons?.['32'] ?? '',
  'panel.html',
);
