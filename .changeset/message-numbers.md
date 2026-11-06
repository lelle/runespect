---
'@runespect/agent': patch
'@runespect/ui': patch
'@runespect/vite-plugin': patch
'@runespect/extension': patch
---

Every message a page sends carries a number, one more than the last. A panel that hears a number skipped knows a message was lost on the way: it records a `gap` (in the extension's event log; the panel window warns once per page in its own console), and asks the page it follows for its tree and history again, so what it shows matches the page.
