# TriggerTangle v0.1 contract

Question: can separately valid automations keep waking each other up through external resources? Rehearse an explicit combined design, show a witness chain, then compare an intervention. This is a limited deterministic model checker, not a live automation scanner or a new invention of cycle detection.

## Inputs and semantics

The canonical version-1 blueprint has a name, one seed signal and up to 100 workflows. Signals carry an exact resource ID, an exact event type and flat scalar fields. A workflow matches resource and event exactly, then evaluates all declared conditions. Disabled workflows never run. Supported condition operators: equals, notEquals, exists, missing. Missing fields fail equals and pass notEquals; exists distinguishes null from missing.

Each matching workflow runs once per incoming event and emits zero to 16 effects. Every effect inherits the original incoming fields, removes `unset` keys, then applies constant `set` values. Sibling effects do not mutate each other. Emissions are unconditional once a workflow matches. Two duplicate effects are two event deliveries; shared downstream states do not deduplicate real deliveries. No JavaScript, shell, template expressions, network or arbitrary code is evaluated.

The engine explores reachable unique signal states breadth-first and records every transition. It finds a concrete reachable directed cycle. Since workflows in this model are stateless and deterministic, revisiting the same signal along a causal cycle can repeat indefinitely **in this model**. It does not establish a real platform will run away. An acyclic complete state graph settles for this seed under these assumptions. A DAG reconvergence is not a loop. When complete and acyclic, count all event paths with integer arithmetic, including duplicate emissions, and report modeled workflow starts.

## Bounds and results

- Input: 200,000 text characters; 100 workflows; 16 effects and 16 conditions per workflow; 32 distinct data-field names across the blueprint; 256 characters per string scalar; safe integer numeric scalars only.
- Default exploration: 256 unique states and 2,048 transitions; configurable up to 512 states and 8,192 transitions.
- Reaching a budget with unexplored work means incomplete. A discovered cycle can still be reported with its witness and `complete: false`. Otherwise incomplete means inconclusive, never settles. Counts are unavailable for cycles or incomplete graphs.
- Report contains states, transitions, one witness, budgets, limitations and exact status. JSON schema ID is `triggertangle.report/v1`. CLI exit 0=settles, 1=loop found, 2=inconclusive, 3=invalid input/error.
- Browser uses a cancellable worker; no uploads or persistent storage. Import/export JSON; standalone HTML report. Data and resource IDs in reports may be sensitive.

## User flow

Start with a contact ping-pong example, a marker-guarded version, a self-reply loop or an acyclic handoff. Show workflow cards and disable one workflow to rehearse an intervention. Compare with the unchanged baseline. Advanced users can edit/import the versioned JSON. Always invalidate stale results after edits and fail explicitly on unsupported or malformed input.

## Deliberate exclusions

No n8n/Zapier import or live-account connection in v0.1. Platform exports hide condition, resource and side-effect semantics; silently inferring these would weaken results. Model owners must provide accurate declarations. No time, retries, concurrency, changed-only writes, database state, idempotency, probabilistic LLM behavior, or delivery deduplication is modeled. A result applies only to the selected seed and declared rules. No result authorizes operating-system or business changes.
