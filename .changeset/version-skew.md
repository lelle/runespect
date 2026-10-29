---
'@runespect/agent': patch
'@runespect/ui': patch
'@runespect/vite-plugin': patch
---

Say so when `@runespect/ui` and `@runespect/vite-plugin` are not the same version. The overlay runs
on the plugin's agent, and another version may lack what it calls: the dev server now warns in the
terminal, and the overlay shows a notice instead of the tree, also next to an agent from 0.1.0.
