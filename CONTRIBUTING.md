# Contributing

## Development

A pnpm workspace; [Packages](docs/reference/packages.md#the-repository) has the layout.

```sh
pnpm install
pnpm --filter @runespect/vite-plugin build   # builds the panel window bundle
pnpm dev:playground                          # showcase with the plugin, at localhost:5173
pnpm verify                                  # type-check, lint, format check and unit tests
pnpm e2e                                     # Playwright, in a real browser
pnpm site:build && pnpm site:preview         # the project site and its demo, at localhost:5183/runespect/
```

The project site (`apps/site`) is built from `docs/`, with its menu from `docs/README.md`; the
demo it links to is `apps/demo`.

## Tests

Almost all tests live in [`apps/playground/test`](./apps/playground/test), including the
ones for `agent`, `ui`, `vite-plugin` and `extension`. That is deliberate: the playground
is the one place where components are compiled through the runespect preprocessor, so a test there
can mount a real instrumented component and follow a value from the page to the panel. `proxy` and
`prod-reader` do not need that and keep their tests next to their code.

You need Node 24 and pnpm 12 (`corepack enable` picks the version from `package.json`). Then
`pnpm install`.

| Command               | What it runs                                                                | Needs first                                                                                         | In CI                        |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm verify`         | type-check, lint, format check, every unit test and the script tests        |                                                                                                     | yes                          |
| `pnpm test:coverage`  | `verify`'s tests in one run, with a coverage report in `coverage/`          |                                                                                                     | yes; the numbers do not gate |
| `pnpm e2e`            | the Playwright suite against the playground, in a real browser              | `pnpm --filter @runespect/vite-plugin build`; Google Chrome installed                               | yes                          |
| `pnpm test:hmr`       | the tree stays whole and live across hot updates                            |                                                                                                     | yes                          |
| `pnpm test:extension` | the real unpacked extension in Chromium, up to the `agent` and `relay` hops | `pnpm --filter @runespect/extension build`; `pnpm --filter playground dev --port 5187 --strictPort` | yes                          |
| `pnpm test:pack`      | the packed packages installed in a fresh Vite app and SvelteKit app         |                                                                                                     | yes                          |

The coverage report counts the unit and component tests only. The Playwright suite drives much of
the overlay and the panel in a real browser (picking, hovering, search, scrolling) and is not
counted, so a low number for a component can be what only e2e tests.

To run one test file: `pnpm --filter playground exec vitest run test/<name>.test.ts`, or
`pnpm exec playwright test e2e/<name>.spec.ts`. [`AGENTS.md`](./AGENTS.md) has the notes for coding
agents.

Write the failing test first; a fix without one tends to come back.

## Commit history

`main` is a straight line: one parent per commit, no merge commits. Every commit follows the same
shape, so the history reads as a changelog and can be filtered per package.

### Message format

```
type(scope): description

Optional body explaining why the change was made.
```

- **Language:** English, here and in every file.
- **Subject:** imperative mood, lower-case start, no trailing period, at most 72 characters. Say
  what the change does for someone using the code.
- **Type** — one of:

  | Type       | Use it for                                                            |
  | ---------- | --------------------------------------------------------------------- |
  | `feat`     | a new capability                                                      |
  | `fix`      | a bug fix                                                             |
  | `docs`     | documentation only                                                    |
  | `test`     | tests only                                                            |
  | `refactor` | a code change that neither fixes a bug nor adds one                   |
  | `perf`     | a performance improvement                                             |
  | `build`    | the build system or packaging                                         |
  | `ci`       | CI configuration                                                      |
  | `style`    | formatting, with no change in meaning                                 |
  | `chore`    | everything else: tooling, dependencies, housekeeping                  |
  | `revert`   | reverting an earlier commit (or keep the subject `git revert` writes) |

- **Scope** — optional. When present it is the package the change belongs to (`ui`, `agent`,
  `vite-plugin`, `extension`, `proxy`, `prod-reader`, `playground`, `sveltekit-spa`,
  `demo`, `site`) or one cross-cutting area (`deps`, `e2e`). A change that spans packages takes the scope of
  the package it is _about_; leave the scope out when it concerns the whole repository.
- **Breaking change:** add `!` before the colon — `feat(agent)!: version the handshake`.
- **Body** — optional, and short: a few lines on _why_ the change was made, when the subject cannot
  carry it. Leave out what the diff already shows — lists of files, test counts, how it was
  verified. Separate it from the subject with a blank line and wrap it at 72 characters.
- **No AI attribution:** no `Claude-Session:` lines, no `Co-authored-by:` for an AI assistant, no
  "Generated with …" footers. Human co-authors are welcome.

### Pull requests

Pull requests are merged with **rebase** only — squash and merge commits are switched off. Every
commit in the pull request therefore lands on `main` as it is and must follow the format above:

- rebase onto `main` instead of merging `main` into your branch
- squash `fixup!` commits (`git rebase -i --autosquash`) before asking for review

### Enforcement

[`scripts/check-commit-msg.ts`](./scripts/check-commit-msg.ts) holds the rules.

- **Locally** it runs as a `commit-msg` hook. `pnpm install` points git at `.githooks/`; to do it by
  hand, run `git config core.hooksPath .githooks`.
- **In CI** it checks every commit in a pull request, and rejects merge commits and unsquashed
  `fixup!` commits.
