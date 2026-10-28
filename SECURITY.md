# Security policy

## Supported versions

runespect is a development tool and is pre-1.0: only the latest release gets fixes.

## What matters here

runespect runs in development, but it still touches things worth protecting:

- the Vite plugin serves the panel from the dev server and relays messages over its HMR channel
- the browser extension runs two content scripts on every page you visit
- the agent exposes `window.__runespect`, which reads and edits your app's state

A way for another site, another origin or another process to reach any of these is a
vulnerability.

## Reporting a vulnerability

Use **Report a vulnerability** on the
[Security tab](https://github.com/lelle/runespect/security/advisories/new) of the repository. Please
do not open a public issue.

Include what an attacker can do, the versions involved, and the steps to reproduce.
