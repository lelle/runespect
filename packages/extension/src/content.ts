import { startRelay } from './relay';

// Runs in the page at document_start. The page (via @runespect/vite-plugin's broadcast)
// posts tree snapshots to window; we relay them to the extension, and relay edit/request
// commands from the panel back to the page.
startRelay(window, chrome.runtime);
