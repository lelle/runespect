---
'@runespect/vite-plugin': patch
---

Report destructured `$state` (`let { a, b } = $state(...)`) name by name; `let` names are editable, a rest element is left out.
