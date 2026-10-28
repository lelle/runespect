# runespect documentation

runespect shows the component tree and live runes state of a Svelte 5 app, and lets you edit it.
These docs are organised by what you want to do.

## Start here

- **New to runespect?** Do the [Getting started tutorial](tutorials/getting-started.md): from
  install to editing a value in the panel.
- **On SvelteKit?** [Use with SvelteKit](how-to/use-with-sveltekit.md).
- **Something does not show up?** Start from the symptom in
  [Troubleshoot](how-to/troubleshoot.md).
- **Want to know how it works?** Read [Architecture](explanation/architecture.md).

## The four kinds of docs

This documentation follows the [Diátaxis](https://diataxis.fr/) model: each page is one of four
kinds, so it is clear whether you are learning, doing, or looking something up.

### Tutorials — learning by doing

- [Getting started](tutorials/getting-started.md) — install the plugin, open the panel, and edit a
  value.

### How-to guides — task-focused

- [Use with SvelteKit](how-to/use-with-sveltekit.md)
- [Open the panel window](how-to/open-the-panel-window.md)
- [Add the in-page overlay](how-to/add-the-overlay.md)
- [Use the browser extension](how-to/use-the-extension.md)
- [Troubleshoot](how-to/troubleshoot.md) — from what you see to what to read.

### Reference — facts

- [The panel](reference/the-panel.md) — what each part of the panel does.
- [Options](reference/options.md) — `runespectPreprocess()` and `runespect()`.
- [Console API](reference/console-api.md) — `window.__runespect`, for a script, a test or a coding
  agent.
- [Event log](reference/event-log.md) — what each hop records, and the shape of an event.
- [Protocol](reference/protocol.md) — the messages between a page and a panel, and how they travel.
- [Packages](reference/packages.md) — the packages, what they need, and how they fit.

### Explanation — understanding

- [Architecture](explanation/architecture.md) — from a component to a row in the panel.
- [Tiers](explanation/tiers.md) — where the panel's data comes from, and what each source can show.
- [What it costs](explanation/what-it-costs.md) — the time the instrumentation adds per flush.
