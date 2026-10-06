# A rehearsal layer for an agent harness

TriggerTangle Harness compares an original design with a proposed change against an **operator-owned scenario suite**. It catches both repeating chains and changes that accidentally remove required work. The deterministic checker makes no model calls and executes no business actions.

The intended flow is: **operator requirements → agent proposal → rehearsal → evidence → operator review → existing controlled execution**. This release implements the rehearsal and evidence portion. Your agent supplies the proposal; your existing system owns approvals and execution. A successful result never unlocks a tool or grants permission.

## Run the included demonstration

Requires Node.js 22+. Build the repository with `npm ci --ignore-scripts` and `npm run build`, or download `trigger-tangle-harness.mjs` from the release and use the corresponding example files.

```sh
node dist/trigger-tangle-harness.mjs \
  --baseline examples/contact-loop.json \
  --candidate examples/guarded-sync.json \
  --suite examples/contact-suite.json
```

The original sync loops when a human changes either side. The proposed marker guard settles after one hop while still delivering the required contact update in both scenarios. That candidate returns **review-required**, with `executionAllowed: false`. A proposal that disables all workflows returns **blocked**, because the required contact updates disappear.

## Separate the requirements from the proposal

The operator chooses baseline, scenarios and budget. The agent may propose a candidate blueprint. Keep the suite and baseline outside the candidate's editable workspace; an agent that can weaken the tests can weaken this check. File paths and executables must be selected by the trusted harness, not extracted from model-generated JSON.

A suite looks like this:

```json
{
  "version": 1,
  "name": "A sale must create a draft invoice",
  "cases": [{
    "id": "won-sale",
    "name": "Keep the invoice draft without sending it",
    "seed": {"resource": "sales/deals", "event": "won", "data": {"deal": "demo-1"}},
    "required": [{"resource": "billing/invoices", "event": "drafted", "data": {"deal": "demo-1"}}],
    "forbidden": [{"resource": "billing/invoices", "event": "sent"}]
  }]
}
```

The suite uses the v1 blueprint's exact resource/event identities and flat scalar fields. Each case's seed replaces **both** designs' embedded seeds. A candidate cannot evade a scenario by choosing a different starting event.

- Require 1–8 cases, unique IDs, and 1–8 required outcomes per case. Up to 8 forbidden outcomes are optional. Unknown properties are rejected.
- A match requires an emitted event with the exact resource/event and all supplied field values. Extra fields are allowed. Missing fields differ from `null`; values retain their types.
- The starting signal alone cannot satisfy an emitted-outcome requirement. Multiple deliveries to one graph state still count separately in the engine's totals.
- Outcome checks establish reachable emissions, **not** exactly-once delivery, final database state, ordering or actual business completion. Current suites deliberately require positive work in every case; cases whose intended outcome is “do nothing” are not supported yet.
- Default exploration is 256 states and 2,048 transitions per case and design. The same selected budget applies to both versions; maxima are 512 and 8,192. Each input file is bounded to 800,000 bytes and 200,000 decoded characters.

## Interpret the report

| Status | Exit | Meaning |
|---|---:|---|
| `review-required` | 0 | Every candidate scenario completes, settles, reaches its required emissions, and avoids its forbidden emissions. Human review and real-platform checks remain necessary. |
| `blocked` | 1 | A cycle or forbidden emission was demonstrated, or a completed exploration lacked required work. |
| `inconclusive` | 2 | Exploration was incomplete without establishing a blocking violation. Never treat this as passing. |
| Invalid input/error | 3 | No valid report was produced; inspect stderr. |

The overall status depends on candidate results. A failing baseline is expected when repairing a loop. `regressions` lists case IDs that were review-ready in the baseline and no longer are in the candidate. A demonstrated violation takes precedence over incomplete exploration.

JSON is written to stdout; diagnostics go to stderr. The report includes the suite, both original input blueprints, resolved budget, per-case findings, exact total delivery counts where available, and `executionAllowed: false`. Loop/incomplete totals are `null`, never zero. To inspect a full causal graph, reproduce an individual case through the original CLI with that case's seed; the harness report keeps per-case results compact.

`evidence.*TextSha256` hashes the UTF-8 encoding of the decoded input text, excluding a leading UTF-8 BOM and preserving other whitespace/newlines. These hashes bind the result to the supplied text. They are **not signatures, approvals or proof of a trustworthy runner**. A host integration should separately verify and record the selected runner binary and raw input-file hashes, and reject changed sources, truncated output, missing fields, or an exit/status mismatch.

Reports contain the supplied workflow rules and sample fields. Keep them local or review them before sharing.

## Omarchy integration

The companion Omarchy workbench adapter invokes the fixed local runner on private snapshots, bounds runtime/output, checks evidence and result consistency, and records an operator-owned receipt. It returns `advisory_only: true` and `authorizes_apply: false`. It does not add broker commands or change patch promotion.

The integration is an explicit workbench command. The future local model can draft a candidate for that command; this release does not claim an installed autonomous model loop or validation on the planned 128 GB machine.

## Useful next additions

1. A visible scenario editor and before/after outcome comparison in the browser, using this same tested engine.
2. An importer for a carefully limited set of real workflow nodes, with unsupported behavior shown as unknown. Native exports are not automatically equivalent to TriggerTangle's event model. [n8n documents its JSON import/export format](https://docs.n8n.io/build/manage-workflows/export-and-import), including credential-related data that should be reviewed before sharing.
3. Observed runtime events compared with the declared model, while a separate trusted controller retains cancellation, action budgets and approvals.

These are future work. The current checker does not simulate timing, retries, concurrency, durable records, platform execution semantics or probabilistic model decisions.
