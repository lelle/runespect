---
'@runespect/vite-plugin': patch
---

The page loads one agent, the plugin's, also when the app's `@runespect/ui` is another version and
the package manager installed a second agent next to it. Vite's own resolver used to hand that
second agent to the overlay, which then showed an empty tree; now the overlay gets the plugin's
agent, and shows its version notice when the two do not match.
