# Choose where to run it

What runespect shows depends on how the app is served. `vite dev` with the plugin is the baseline,
and everything works there. Elsewhere, this is what you get:

| How the app runs                                           | Panel window | Overlay | Extension  |
| ---------------------------------------------------------- | ------------ | ------- | ---------- |
| `vite dev`, local or on a shared server                    | Live         | Live    | Live       |
| `vite dev` with `server.hmr: false`                        | Live         | Live    | Live       |
| `vite dev` with no WebSocket (`server.ws: false`, a proxy) | no           | Live    | Live       |
| `vite build` with `includeInRelease`, deployed             | Live         | no      | Live       |
| `NODE_ENV=development vite build`, deployed                | no           | no      | Names only |
| `vite build`, deployed                                     | no           | no      | nothing    |

[What the panel can show](../explanation/tiers.md) explains the difference: Live has values, editing
and history, and Names only has only an approximate tree of component names.

## On a dev or test environment

There are two ways to get values and editing on another environment.

### Build runespect into the app

Turn on [`includeInRelease`](../reference/options.md#includeinrelease) for that environment's build:

```ts
runespect({ includeInRelease: process.env.DEPLOY_ENV === 'test' });
```

```sh
DEPLOY_ENV=test vite build
```

Open the app, then `/__runespect/` in another tab of the same browser, or use the extension. Keep the
slash at the end: not every host adds it. Some hosts treat a folder that starts with `_` specially;
GitHub Pages needs a `.nojekyll` file to serve it.

Anyone who can open the build can read and edit its state, so give each environment its own build,
and never promote this one to production.

### Run the dev server there

```sh
vite dev --host
```

Vite refuses host names it does not know, so add the environment's
name to [`server.allowedHosts`](https://vite.dev/config/server-options#server-allowedhosts). Behind a
reverse proxy, the proxy has to forward WebSockets for the panel window to work. If it does not, use
the extension.

Anyone who can open the app can then also open the panel and change its state, and the dev server
serves them the source. Keep such an environment closed to the outside.

## Component names only

Without the plugin in the build, a development build gives Names only in the extension:

```sh
NODE_ENV=development vite build
```

`--mode development` alone is not enough, because `vite build` still sets `NODE_ENV` to `production`.

This build runs Svelte's development code, so it is larger and slower than the real one, and it
contains your components' source paths. A production build shows nothing at all, because it carries
no component information.
