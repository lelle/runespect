# What it costs

Until a panel opens, runespect reads none of the app's values and sends nothing as the app changes:
each component hands the agent a function per value, and nothing calls it. Once a panel opens (the
panel window, the extension, the overlay or `window.__runespect`), the agent reads every value in an
`$effect` of its own, and one effect root turns each flush into a list of changes and a commit in the
history. That is the whole cost, and it is paid in development only: a production build carries none
of it, unless you turn on [`includeInRelease`](../reference/options.md#includeinrelease).

Measured in headless Chromium (one page of components that each hold a
`$state` and a `$derived`, median per flush where every component changes):

| Components | Without runespect | With runespect, no panel | With the panel window open |
| ---------- | ----------------- | ------------------------ | -------------------------- |
| 1,000      | 0.6 ms            | 0.7 ms                   | 4.0 ms                     |
| 5,000      | 3.3 ms            | 3.6 ms                   | 21.7 ms                    |

When one component changes, the flush stays under 0.1 ms in every column.

The history starts when the first panel opens, and holds at most 200 commits and about 4 MB; past
that the oldest are dropped. The page keeps reporting for the rest of its life, so closing the panel
and opening it again shows what happened in between.

Values are sent one level deep, so a large object costs what its first level costs until someone
opens it in the panel.
