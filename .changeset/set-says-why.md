---
'@runespect/agent': patch
---

`__runespect.set()` says why it did nothing: a console warning with the reason, and a `refused` event in the event log, which a refused edit from the panel now records too. A path to an array index the array does not have, or that is not a whole number, is refused instead of adding a stray property.
