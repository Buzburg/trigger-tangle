# Verification record

Local verification date: October 6, 2026. Windows, Node.js 25.9.0, Playwright 1.58.2, Chromium and Firefox. The GitHub verification and release workflows repeat the checks independently on Ubuntu with Node.js 22.

## Results

- Strict TypeScript check passed.
- All 78 core, validation, builder, CLI and report tests passed against the built CLI.
- All 42 browser tests passed against the final standalone HTML, loaded through `file://` with network access disabled.
- Builder checks cover both resource directions, exact IDs, shared marker behavior, invalid drafts preserving the valid result, export, literal markup, narrow layouts and accessibility.
- A separate transitive-closure oracle checked every one of the 512 possible three-node directed graphs. Every reported cycle witness was checked for reachability, continuity and closure.
- Tested reconverging branches, duplicate emissions, exact counts above JavaScript's safe integer range, missing versus null fields, marker guards, independent sibling effects, disabled workflows and exact resource identity.
- Tested complete searches that finish exactly at a budget, incomplete searches, and a valid cycle witness discovered within an otherwise incomplete graph. Incomplete results never report settlement or complete counts.
- Tested CLI exit codes, blueprint round trips, preservation of source files, invalid UTF-8, BOMs, malformed/unsupported input, nonregular files, size limits and terminal-control escaping.
- Browser checks cover baseline/intervention comparison, import/export, cancellation, worker timeouts, already-queued stale responses, unsafe markup rendered as text and standalone report downloads.
- Automated axe scans reported no violations in the tested workbench/editor/result states in both browsers. This is not a complete accessibility certification.
- Layout checks cover 320, 768, 1024 and 1440-pixel widths. Desktop and narrow-screen captures were visually inspected.
- Dependency audit reported zero known vulnerabilities. There are no third-party runtime packages in the delivered app or CLI; pinned development dependencies are audited again in CI.

## Review decisions

The core implementation and tests received separate agent review. A reachable causal cycle is distinguished from a diamond-shaped reconvergence. The model preserves parallel delivery counts, and every export includes the blueprint snapshot needed to reproduce it. Partial-state matching is labeled as incomplete in the UI.

Browser imports use fatal UTF-8 decoding so invalid bytes cannot silently change resource identities. Rendered names and fields use text nodes; HTML exports escape untrusted strings. The CLI escapes dynamic data in text output. The browser worker is disposable, with cancellation, timeout and stale-result protection.

## What remains unverified

No live n8n, Zapier, CRM, billing, calendar or email integration was executed. No production effectiveness, adoption or worldwide novelty claim is established. Safari/mobile file-selection behavior is untested. The model deliberately excludes stateful records, concurrency, retries, timing and probabilistic decisions; accurate declarations and additional real-system testing remain necessary.

Release automation publishes only after its checks pass and emits `SHA256SUMS.txt`. The delivery procedure downloads the published artifacts and compares their bytes with the tested local build; release status is available on GitHub Actions.
