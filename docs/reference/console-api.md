# Console API

The agent answers in the page's own console as `window.__runespect`, so a script, a test or a
coding agent with a browser tool (Playwright MCP, Chrome DevTools MCP) can read and change state
without the panel. It exists in development only, once the agent has connected to a panel or to the
page's `postMessage` broadcast, which `runespect()` sets up.

```js
const [cart] = __runespect.find('Cart'); // by name, or /regex/
__runespect.values(cart.id); // { prop: {…}, state: { items: […] }, derived: {…} }
__runespect.inspect(cart.id, ['items', 0]); // below the first level
__runespect.set(cart.id, 'coupon', 'SPRING'); // true when applied, as an edit from the panel
__runespect.history(); // what changed, flush by flush
```

| Member                           | Returns                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `tree()`                         | every component, in the order they mounted: `{ id, name, parent, children, loc? }`                 |
| `find(query)`                    | components whose name contains `query` (any case), or matches it as `/regex/flags`                 |
| `values(id)`                     | one component's values grouped by kind (`state`, `derived`, `prop`, `store`, …); `null` if unknown |
| `inspect(id, path, limit?)`      | the value at `[symbol, ...keys]`, one level deep; `limit` entries of a wide one                    |
| `history(since?)`                | the commits after `since` (a commit's `seq`), oldest first                                         |
| `set(id, symbol, value, path?)`  | sets a writable value, or a field inside one at `path`; `true` when applied                        |
| `events`, `since(seq)`, `dump()` | the event log of every hop: [Event log](event-log.md)                                              |

When `set()` does nothing it returns `false`, warns in the console with the reason, and records it in
the event log as `{ ev: 'refused', id, error }`. An edit from the panel that is refused is
recorded the same way, without the warning:

```
[runespect] set(17, 'query') did nothing: component 17 has unmounted
```

| `error`             | when                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `unmounted`         | the component has unmounted since you read its id                                                                                        |
| `unknown-component` | the page never had a component with that id                                                                                              |
| `unknown-symbol`    | the component has no value by that name                                                                                                  |
| `not-writable`      | the value is not `$state` or a `$bindable` prop, such as a `$derived`                                                                    |
| `bad-path`          | `path` runs past the value, through something other than a plain object or array, or to an array index other than one it has or the next |
| `carries-marker`    | the value holds a placeholder the panel shows for something not loaded                                                                   |

The console counts as a panel: `values()`, `inspect()`, `history()` and `set()` start the agent
reading the app's values, so the history starts at the first of those calls when no panel is open.

Values come as the panel receives them: one level deep, cut when wide or long, and encoded where
JSON cannot carry them;
[the protocol](../explanation/architecture.md#3-the-protocol) has the limits. The
types are exported from `@runespect/agent` as `RunespectSurface` and `ComponentSummary`.
