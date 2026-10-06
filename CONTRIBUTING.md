# Contributing

TriggerTangle is intentionally a small, explicit model. A useful change makes a supported rule more reliable or its result easier to understand. New integrations must not guess hidden platform behavior.

## Work locally

Use Node.js 22 or later. From a checkout:

```sh
npm ci --ignore-scripts
npx playwright install chromium firefox
npm run check
```

On Linux, Playwright may also need its documented system dependencies (`npx playwright install --with-deps chromium firefox`). Dependency installation needs network access; the built app runs offline. `npm run build` writes the distributable app, CLI, and checksums under `dist/`.

## Propose a change

Read [docs/DESIGN.md](docs/DESIGN.md) first. Include a small synthetic blueprint demonstrating the problem, the expected outcome, and the current outcome. Do not attach customer records, private workflow exports, credentials, or internal resource identifiers.

For behavior changes, add a regression that distinguishes the intended result from a plausible mistake. Particularly useful cases include reconverging branches, duplicate emissions, missing versus null fields, sibling effects, unreachable cycles, and exploration limits. UI changes should remain usable with a keyboard and on a narrow screen.

Keep strict types and validate external input. Do not add evaluation of code, templates, shell commands, or network calls to the model. Unsupported input must produce an explicit error. A budget limit must never become a successful result, and a UI edit must never leave an old result looking current.

Describe the final behavior and verification in the pull request. Separate measurements from assumptions; do not claim live-platform effectiveness from synthetic tests. Contributions are under the repository's MIT license.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.
