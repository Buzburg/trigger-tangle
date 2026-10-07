# TriggerTangle v0.4.0

Rehearse how separate automations trigger each other using an explicit, limited event model. See a reachable cycle, compare disabling a workflow, or learn that the declared chain settles for the selected starting event.

## New in this release

- Adds a captioned 20-second walkthrough: a feedback loop, a marker guard, and separate checks that useful sync still works in both directions.
- Includes a shareable 720p MP4 and an offline HTML version with keyboard playback controls and reduced-motion support.
- Generates the illustration from actual analyzer reports on synthetic rules, with downloadable evidence and checksums.
- Adds deterministic frame capture and browser checks for the walkthrough. No new runtime dependencies.

## Existing harness integration

- Adds `trigger-tangle-harness.mjs`, a dependency-free review layer for a custom agent harness.
- Compares baseline and candidate designs across up to eight operator-owned scenarios, with required and forbidden emitted outcomes.
- Rejects proposals that remove necessary work, identifies regressions, and keeps incomplete results inconclusive.
- Binds reports to decoded input-text hashes, includes the input snapshots, and always reports `executionAllowed: false`.
- Includes a two-direction contact-sync suite and [integration contract](https://github.com/Buzburg/trigger-tangle/blob/v0.3.0/docs/HARNESS.md). The browser workbench retains the v0.2 interaction model; multi-scenario comparison is currently a command-line capability.

## Downloads

- `trigger-tangle.html`: open this standalone offline app in a modern browser.
- `trigger-tangle.mjs`: command-line checker for Node.js 22 or later. Start with `node trigger-tangle.mjs --help`.
- `trigger-tangle-harness.mjs`: compare baseline, candidate and operator-owned suite. Start with `node trigger-tangle-harness.mjs --help`.
- `trigger-tangle-demo.html`: open the interactive 20-second illustrated walkthrough offline.
- `trigger-tangle-20s.mp4`: silent, captioned 1280 × 720 video, 30 fps, exactly 20 seconds.
- `trigger-tangle-demo-evidence.json`: the reports used in the illustration and source/video hashes.
- `SHA256SUMS.txt`: SHA-256 digests for the release files.

The released app and CLI require no runtime packages, account connection, or model API key. The browser app imports and exports JSON and produces a standalone HTML report.

## Included

- Exact resource and event matching, flat scalar fields, simple conditions, constant field updates, and disabled workflows.
- Bounded exploration with a concrete cycle witness and explicit incomplete results.
- Modeled workflow-start and emitted-event counts when exploration completes without a cycle.
- Examples for a contact round trip, marker guards, self-replies, and an acyclic handoff.
- Offline reports with the producing blueprint and machine-readable CLI results.

## Understand the result

`settles` applies only to the selected seed and declared rules. `loop-found` establishes a repeatable cycle in this model. `inconclusive` means the exploration could not finish within its limits without establishing a cycle. A discovered cycle can be reported even when the rest of the graph is incomplete; check the report's completeness field.

No live systems are connected or changed. v0.4 does not import platform exports or model time, retries, concurrency, database state, delivery deduplication, or probabilistic agents. Reports contain input data and may be sensitive. Results do not authorize any operating-system or business action.

See [the model contract](https://github.com/Buzburg/trigger-tangle/blob/v0.3.0/docs/DESIGN.md) and [security boundaries](https://github.com/Buzburg/trigger-tangle/blob/v0.3.0/SECURITY.md) before applying a rehearsal to a real workflow.
