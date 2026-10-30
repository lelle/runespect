# Changesets

Each change a user of the npm packages or the extension would notice adds a file here: which
packages it bumps and one line for the CHANGELOG. Create one with `pnpm changeset` and commit it
with the change. A change to `agent`, `ui`, `vite-plugin` or `extension` that users will not notice
gets an empty one, `pnpm changeset --empty`. CI checks both (`scripts/check-changesets.ts`).

- `@runespect/agent`, `ui` and `vite-plugin` share one version: a bump to any of them releases all
  three.
- `@runespect/extension` has its own version and is tagged `@runespect/extension@x.y.z`; it is not
  on npm, it goes to the Chrome Web Store.

## Which bump

Until 1.0:

- `patch`: a fix, or a small improvement.
- `minor`: a new feature, or anything that breaks how the packages were used before. Start the
  line with "Breaking:".
- `major`: not before 1.0. It would release 1.0.0, so CI refuses it.

An app that depends on `^0.1.0` gets every `0.1.x`, and never a `0.2.0` by itself.

## When to release

The "chore: version packages" pull request gathers everything that waits, and merging an ordinary
pull request releases nothing. Release when what waits is worth it to users: a fix for something
that hurts someone goes out at once, smaller things are gathered. There is no fixed rhythm.

## How a release happens

1. Changes land on `main` with their changesets.
2. The Release workflow opens or updates the "chore: version packages" pull request, which bumps the
   versions and writes each package's `CHANGELOG.md`. CI on the workflow's commits waits for
   approval: approve the run in the pull request's checks (or
   `gh api -X POST repos/lelle/runespect/actions/runs/<run-id>/approve`). Each new change on `main`
   updates the pull request, and its run waits again.
3. Merging it starts the publish job, which waits for approval in the `Release` environment and
   then publishes to npm with provenance through trusted publishing (OIDC). Approve or cancel it
   right away: a waiting publish holds every later release run.
4. A release of only the extension goes through the same job: it publishes nothing to npm and tags
   `@runespect/extension@x.y.z`. On a new tag, build the extension
   (`pnpm --filter @runespect/extension build`), zip `packages/extension/dist` and upload it in the
   Chrome Web Store dashboard.
