import { startRouting } from './routing.js';

// Service worker: routes messages between content scripts and devtools panels by tabId.
startRouting(chrome.runtime, chrome.tabs);
