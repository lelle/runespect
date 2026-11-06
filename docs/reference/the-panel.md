# The panel

What each part of the runespect panel does. The panel is the same in the window at
`/__runespect/`, in the in-page overlay and in the extension's DevTools tab;
[What the panel can show](../explanation/tiers.md) says what each source of data can show.

## The tree

- Every component, nested as it is mounted, and **Modules**: the top-level state of `.svelte.ts`
  modules.
- A component's name opens its source file in your editor, through the dev server; a notice says
  so for 3 seconds, and where to look if nothing opens. `runespect({ openInEditor: 'vscode' })`
  makes them `vscode://` links, `false` removes them ([Options](options.md#runespectoptions)).
- Right-click a row, or press Shift+F10, for **Open in editor**, **Log to console**, **Highlight in
  page** and **Copy name**.
- Hovering a row highlights its element in the page. A component that renders only other
  components gets a dashed box around what they render, named `Name (via children)`. **⌖ pick**
  selects the component under the element you click in the page.
- Alt+↑ and Alt+↓ move between siblings.

## Which page

- The chip beside the tier names the page the panel follows by its url. When the dev server serves
  several pages (two tabs, another route), it says how many there are: `/checkout · 3 pages ▾`. A
  closed tab leaves the list; a reloaded one stays one row, and the panel stays with it.
- With no url to follow, the panel takes a tab that is shown over one in the background. It stays
  with the page it follows until that page is gone: another tab opening, or the user switching
  tabs, does not move it.
- ▾ lists them, two lines each: url and when it last spoke; then title, tier and agent version. Click
  one to follow it.
- A page that navigates on the client is listed under its new url and title.

## Search and filters

- **Filter** matches component names, as text or as a `/regex/`. `/` focuses it, Esc clears it.
- **Only components with state**, in the settings menu, shows only components with reactive values.
  A prop counts as a value. While it is on, a line above the tree says so, and its × turns it off.
- **Hide** takes comma-separated fragments of names or files. A hidden component's children stay,
  one level up.

## Values

- The selected component's values, grouped by kind: props, state, derived values, stores, class
  fields, context, and what it provides with `setContext`. The snippets it declares are listed
  after them. [What is reported](options.md#what-is-reported) has the rules.
- A value blinks when it changes.
- Objects, arrays, `Map`, `Set` and `URLSearchParams` open one level at a time. Nested values are
  fetched when you open them. A list longer than 100 entries or a string longer than 10,000
  characters arrives in part, and showing more fetches the rest.
- A `Date` is shown as its time, and a reactive class such as `MediaQuery` by its `current`.

## Editing

- `let` state, `$bindable()` props and `$state` class fields are editable. The app follows as you
  type.
- Strings and numbers are text fields, booleans are checkboxes, and the fields of an object or an
  array are edited in place.
- Everything else is read-only: `$derived` values, other props, stores and context.

## Copy, $r and log

Right-click a value for:

- **Copy value**: a string as it is, anything else as JSON.
- **Store as $r**: `window.$r` becomes the app's own value, so a call on it changes the app.
- **Log to console**: the component and its values, in the page's console.

## History

The **History** tab lists what changed, one row per flush of Svelte's updates: each value from what
to what, and the components that mounted or unmounted. It starts when the first panel opens on the
page, and keeps the last 200 flushes, or about 4 MB.

History is read-only by design. The side effects of a change have already happened, so restoring a
past state would promise more than it can keep.

## Settings

The ⚙ menu has **Flash on update**, **Expand values** (open each value's first level) and
**Theme**. Its footer shows the version the panel was built from.
