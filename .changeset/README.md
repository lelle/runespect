# Changesets

Each change a user of the npm packages or the extension would notice adds a file here: which
packages it bumps (`major` / `minor` / `patch`) and one line for the CHANGELOG. Create one with
`pnpm changeset` and commit it with the change.

- `@runespect/agent`, `ui` and `vite-plugin` share one version: a bump to any of them releases all
  three.
- `@runespect/extension` has its own version and is tagged `@runespect/extension@x.y.z`; it is not
  on npm, it goes to the Chrome Web Store.

## How a release happens

1. Changes land on `main` with their changesets.
2. The Release workflow opens or updates the "chore: version packages" pull request, which bumps the
   versions and writes each package's `CHANGELOG.md`.
3. Merging it starts the publish job, which waits for approval in the `Release` environment and
   then publishes to npm with provenance through trusted publishing (OIDC). Approve or cancel it
   right away: a waiting publish holds every later release run.
