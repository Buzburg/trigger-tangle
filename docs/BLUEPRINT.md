# Blueprint v1 reference

Blueprint JSON must be an object with exactly `version`, `name`, `seed`, `workflows`. Unsupported properties and versions are errors. No external references, code, placeholders or expression evaluation exist. Strings such as `{{$json.id}}` are ordinary literal strings, not platform expressions.

| Field | Meaning |
|---|---|
| `version` | Integer `1` |
| `name` | Nonempty text, at most 200 characters |
| `seed` | `{resource, event, data}`: one initial signal |
| `workflows` | Array of zero to 100 workflow objects |

## Signal and workflow

`resource` and `event` are nonempty, exact strings of up to 120 characters without control characters. Use stable, distinct resource IDs such as `sheets/client-a/contacts` and `sheets/client-b/contacts`. Giving two different real resources the same identifier invents a connection; inconsistent names hide a connection.

`data` is a flat object of scalar fields. A value can be a string of up to 256 characters (including the empty string), a safe integer, a boolean or null. Arrays, nested objects, fractional/nonfinite/unsafe numbers are rejected. Field names start with an ASCII letter followed by letters, numbers, underscore, period or hyphen; at most 64 characters. `constructor` and `prototype` are forbidden. Periods are literal characters, not nested-path syntax. The entire blueprint can mention at most 32 distinct field names across seeds, conditions, setters and removals, including disabled workflows.

A workflow has these properties:

| Property | Required | Meaning |
|---|---|---|
| `id` | Yes | Unique nonempty text, at most 64 characters |
| `name` | Yes | Nonempty display text, at most 200 characters |
| `enabled` | No | Boolean; omitted means true |
| `on` | Yes | `{resource, event}` matched exactly |
| `when` | No | Up to 16 conditions, combined with AND; empty/omitted means unconditional |
| `emit` | Yes | Zero to 16 emitted-effect objects |

Names and IDs cannot contain ASCII control characters. A matching workflow with no effects still counts as one start; it emits no signal.

## Conditions

- `{"field":"origin","op":"equals","value":"human"}`: field exists and equals the scalar, without coercion.
- `{"field":"origin","op":"notEquals","value":"sync"}`: field is missing or differs from the scalar.
- `{"field":"processed","op":"exists"}`: field exists, even if null, false or empty.
- `{"field":"processed","op":"missing"}`: field is absent.

`value` is required for equals/notEquals and forbidden for exists/missing. Different operators such as regex, contains, greater-than or arbitrary expressions are unsupported.

## Effects

An effect is `{resource, event, set?, unset?}`. For each effect independently:

1. Copy the original incoming fields.
2. Remove each field in `unset` (up to 32 distinct names; duplicate removals are rejected).
3. Apply scalar constants in `set`. Setting a removed key adds it back.
4. Emit one new signal with the effect's resource and event.

Emitting the same signal twice means two deliveries. Every matching workflow may react to both. This is not a deduplication mechanism. Emitted data inherits the parent signal only because the design declares those semantics; confirm your real workflow actually carries the required fields.

## Exploration and reports

The engine merges equivalent states for analysis using exact resource/event identity and canonically ordered field keys. It preserves parallel transition edges for delivery counting. A back-edge along a reachable causal path supplies a closed cycle witness; merely meeting a previously visited state from another branch is insufficient.

Default limits are 256 unique states and 2,048 transitions. CLI flags can set 1–512 states and 1–8,192 transitions. A graph can finish at the exact limit; it becomes incomplete only when another required state/transition cannot be added. A partial graph can prove a cycle within the model if its witness is already present, but it cannot prove settlement or complete counts. `State.matches` is also partial in an incomplete graph.

Report schema: `triggertangle.report/v1`. It includes the exact blueprint snapshot, budget, states, transitions, one cycle witness (if found), completeness flag, status, counts and assumptions. Counts are decimal strings, using exact integer arithmetic; they are null for loops or incomplete exploration. They describe this model, not billable task estimates or observed service executions.

Text input is limited to 200,000 characters; the CLI reads at most 800,000 UTF-8 bytes. A UTF-8 BOM is accepted by file import. Keep input files stable during scanning.
