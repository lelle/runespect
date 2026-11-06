---
'@runespect/agent': patch
'@runespect/ui': patch
'@runespect/vite-plugin': patch
'@runespect/extension': patch
---

Open in editor works with any editor: it asks the dev server to open the file through Vite's `/__open-in-editor`, which opens the editor `LAUNCH_EDITOR` or `EDITOR` names, so WebStorm, Rider, Zed and others work as well as VS Code. A notice says so for 3 seconds, and where to look if nothing opens. `runespect({ openInEditor: 'vscode' })` keeps the `vscode://` links, for a dev server on another machine.
