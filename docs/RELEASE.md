# TriggerTangle v0.2.0

Rehearse how separate automations trigger each other using an explicit, limited event model. See a reachable cycle, compare disabling a workflow, or learn that the declared chain settles for the selected starting event.

## New in this release

- Build a two-way sync by naming two resources and an event, without writing JSON.
- Try the shared origin-marker rule in both directions, with its one-hop behavior and real-system assumptions explained.
- Invalid builder drafts preserve the last valid design and report.
- A static-host-ready app is generated in `dist/site/index.html`; no public deployment is automatic.
- Includes a bounded launch-assistant plan, channel rules and a short demo outline.

## Downloads

- `trigger-tangle.html`: open this standalone offline app in a modern browser.
- `trigger-tangle.mjs`: command-line checker for Node.js 22 or later. Start with `node trigger-tangle.mjs --help`.
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

No live systems are connected or changed. v0.2 does not import platform exports or model time, retries, concurrency, database state, delivery deduplication, or probabilistic agents. Reports contain input data and may be sensitive. Results do not authorize any operating-system or business action.

See [the model contract](https://github.com/Buzburg/trigger-tangle/blob/v0.2.0/docs/DESIGN.md) and [security boundaries](https://github.com/Buzburg/trigger-tangle/blob/v0.2.0/SECURITY.md) before applying a rehearsal to a real workflow.
