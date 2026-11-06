---
'@runespect/ui': patch
'@runespect/extension': patch
---

The panel keeps to its tab across a reload, and drops tabs that are gone: a closed tab leaves the list, and a reloaded one stays one row. Another tab opening, or one saying hello again, no longer takes the panel from the page it follows. With no url to follow, it takes a tab that is shown over one in the background. The chip says `· 3 pages`. A page asked for its tree that does not send it in time is asked again.
