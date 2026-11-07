# Vocabulary

The words this project uses for its parts, and which names in the code use them. Some words mean
more than one thing; those are listed with each meaning, so a name like `Source` can be read
without guessing.

## The parts

| Word          | Means                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **page**      | One loaded document that runs the agent. It has an id, new on every load (`from` on each message it sends). A reload is a new page.                                                   |
| **agent**     | The runtime in the page: it holds the tree, values, setters and history, and talks to panels (`@runespect/agent`).                                                                    |
| **panel**     | The interface that shows the tree: in a DevTools tab, in the window at `/__runespect/`, or as the `<Inspect>` overlay. It is the same component, `<Panel>`, driven by a transport.    |
| **transport** | Anything with `send` and `onMessage` that carries messages between a page and a panel: `window.postMessage`, Vite's HMR channel, a `BroadcastChannel`, or direct calls (the overlay). |
| **hop**       | One step a message takes between the page and the panel (agent, relay, panel-port, panel). Each keeps an event log. See [Event log](../reference/event-log.md).                       |
| **flush**     | The agent reading the tree once after a change. A flush that changed something becomes a **commit** in the history, made of **ops** (add, update, remove).                            |

## Which page the panel follows

| Word            | Means                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **follow**      | The panel shows exactly one page at a time. It follows a page for one of three reasons: the user **picked** it, it is at the **url** the panel was opened for, or it was the **first** heard. |
| **focus**       | Which page the panel follows, and why (`Focus` in `packages/ui/src/follow.ts`): none, waiting for a url, or following a page.                                                                 |
| **link**        | The page's side of the same conversation: its mode (quiet, watched, following, away, ended) and what it sends (`packages/agent/src/link.ts`).                                                 |
| **peer** (code) | The list of pages the panel has heard, and what a message did to it (`PeerStep` in `packages/ui/src/sources.ts`). Not a term used in the interface.                                           |

The table in [Which page the panel follows](../reference/protocol.md#which-page-the-panel-follows)
lists the situations.

## "Source" means four things

| Where                                                                                       | Means                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Source`, `listedSources` (`packages/ui/src/sources.ts`)                                    | A **page** the panel has heard: its id, url, title, tier and how long ago it spoke.                                        |
| `FromSource`, `ToSource`, `SourceIdentity` (`packages/agent/src/protocol/internal.ts`)      | Also **pages**: a message from a page, a message for a page, and the url, title and visibility it states.                  |
| The `source` field on every message, `SOURCE`                                               | The string `'runespect'`: how a listener on a shared channel finds our messages. It names no page.                         |
| [What the panel can show](tiers.md): "each source"                                          | Where the **data** comes from (the **tier**).                                                                              |
| `symbolsSource`, `RawSourceMap`, `componentNamesFromSourcemap` (`packages/vite-plugin/src`) | **Source code**, as in a compiler; also the "Source file" column in [tiers](tiers.md), the file a component is defined in. |

In the code, "page" and "source" are used for the same entity in different places, and the names
have not been unified.

## Tier

How the panel's tree is obtained, reported in a page's `hello` (see [What the panel can show](tiers.md)).

| Number in the code | Name in the panel              | Means                                                       |
| ------------------ | ------------------------------ | ----------------------------------------------------------- |
| `tier: 0`          | **Live**                       | The app's own runespect plugin reports the tree and values. |
| none               | **Names only**                 | The extension reads component names from the page's DOM.    |
| `tier: 2`          | **Capture** (**Experimental**) | The experimental capture reads Svelte's private runtime.    |
