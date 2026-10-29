---
'@runespect/agent': patch
'@runespect/vite-plugin': patch
---

Highlight and pick the instance you point at, also in a list. A component that renders several
elements side by side marked the elements of its first instance, and after rows left a list and came
back, a row could mark another row. The plugin now tells the agent which instance renders each
element, instead of the agent guessing from the order of files and elements in the page, and the
highlight covers all of an instance's elements, not only its first.
