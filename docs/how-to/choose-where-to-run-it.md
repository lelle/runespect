# Choose where to run it

What runespect shows depends on how the app is served. `vite dev` with the plugin is the baseline,
and everything works there. Elsewhere, this is what you get:

| How the app runs                                           | Panel window | Overlay | Extension |
| ---------------------------------------------------------- | ------------ | ------- | --------- |
| `vite dev`, local or on a shared server                    | Tier 0       | Tier 0  | Tier 0    |
| `vite dev` with `server.hmr: false`                        | Tier 0       | Tier 0  | Tier 0    |
| `vite dev` with no WebSocket (`server.ws: false`, a proxy) | no           | Tier 0  | Tier 0    |
| `vite build` with `includeInRelease`, deployed             | no           | no      | Tier 0    |
| `NODE_ENV=development vite build`, deployed                | no           | no      | Tier 1    |
| `vite build`, deployed                                     | no           | no      | nothing   |

[Tiers](../explanation/tiers.md) explains the difference: Tier 0 has values, editing and history, and
Tier 1 has only an approximate tree of component names.

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

Everyone who looks at the state then needs the extension. Anyone who can open the build can read and
edit its state, so give each environment its own build, and never promote this one to production.

### Run the dev server there

```sh
vite dev --host
```

This also gives the panel window. Vite refuses host names it does not know, so add the environment's
name to [`server.allowedHosts`](https://vite.dev/config/server-options#server-allowedhosts). Behind a
reverse proxy, the proxy has to forward WebSockets for the panel window to work. If it does not, use
the extension.

Anyone who can open the app can then also open the panel and change its state, and the dev server
serves them the source. Keep such an environment closed to the outside.

## Component names only

Without the plugin in the build, a development build gives Tier 1 in the extension:

```sh
NODE_ENV=development vite build
```

`--mode development` alone is not enough, because `vite build` still sets `NODE_ENV` to `production`.

This build runs Svelte's development code, so it is larger and slower than the real one, and it
contains your components' source paths. A production build shows nothing at all, because it carries
no component information.
