# Chrome Web Store listing

What to enter in the Chrome Web Store developer dashboard for this extension: the parts that follow the
code, such as its name, permissions and privacy answers. Change it together with what it describes. The
summary, description, screenshots and promo tiles are marketing, and do not need to be in the
repository.

## Publisher

- **Publisher:** runespect, shown as "Offered by" on the listing
- **Contact email:** runespect@googlegroups.com, verified on the publisher's settings page. Anyone can
  write to the group; only its members read what arrives.

## Store listing

- **Name:** runespect: Svelte 5 DevTools (from `packages/extension/manifest.json`)
- **Category:** Developer Tools
- **Language:** English
- **Icon:** `public/icons/icon-128.png`
- **Homepage:** https://github.com/lelle/runespect
- **Support:** https://github.com/lelle/runespect/issues

## Privacy practices

- **Single purpose:** Inspect and edit the components and state of a Svelte app under development,
  in a Chrome DevTools panel.
- **Permission justification, host access (content scripts on all sites):** A development server can
  run at any address (localhost, a LAN address, a staging host). The content scripts pass the app's
  own devtools messages to the DevTools panel and read the component names Svelte adds to elements in
  development builds. They find nothing, and do nothing, on other pages.
- **Remote code:** No.
- **Data usage:** The extension collects no user data. Check none of the data types. Certify the
  three statements (no selling, no use unrelated to the single purpose, no use for credit).
- **Privacy policy URL:** https://github.com/lelle/runespect/blob/main/PRIVACY.md

## Before submitting

- The repository is public, so the homepage, support and privacy policy links resolve.
- `pnpm --filter @runespect/extension build`, then zip the contents of `packages/extension/dist/`.
- The version in `packages/extension/package.json` is the version being released.
