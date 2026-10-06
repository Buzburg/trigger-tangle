# Security and trust boundaries

TriggerTangle checks a declared design. It is not an authorization service, a sandbox for arbitrary code, or a monitor for live automations.

## What the model trusts

The author supplies the resource IDs, event names, rules, and starting event. The checker can validate their structure and explore their declared consequences; it cannot establish whether they accurately describe a real platform. Results apply only to that seed and those rules.

The model has no time, retry policy, concurrency, persistent database state, changed-only writes, delivery deduplication, or probabilistic agent behavior. A modeled guard is a condition evaluated in the rehearsal, not evidence that the equivalent protection exists in production. Disabling a workflow in the app only changes the rehearsal.

`settles` is not a live-system safety certificate. `loop-found` describes a reachable cycle in the declared model. Exploration limits can leave a result incomplete. No result grants permission to modify files, operating systems, accounts, or business data.

## Local data

The standalone browser app processes imported blueprints locally and does not upload them or persist them in application storage. Exported JSON and HTML reports contain event fields, resource identifiers, workflow names, and intermediate states. Treat the downloaded files as potentially sensitive; offline processing does not make them anonymous. The browser, extensions, operating system, and anyone receiving a report remain part of your trust boundary.

Use synthetic examples for public issues. Never place API keys or passwords in a blueprint. The CLI reads the input file you provide; protect files and redirected output with appropriate local permissions.

## Untrusted input

Only the documented JSON model is supported. JavaScript, shell commands, template expressions, and network operations are not part of the language. Input size and graph exploration are bounded. Rendered input must remain text rather than executable markup. Malformed or unsupported input must fail explicitly instead of silently weakening the model.

Verify release checksums against a trusted copy of `SHA256SUMS.txt` to detect accidental changes. A checksum published alongside a file is not independent proof of publisher identity if the release itself is compromised. Installing development dependencies uses a different trust boundary from opening the bundled app: review the lockfile and use the documented development commands.

## Reporting a vulnerability

Please do not put credentials, personal data, or an exploit against a live service in a public issue. Use GitHub's **Report a vulnerability** option if private vulnerability reporting is enabled for this repository. If it is unavailable, open a minimal issue requesting a private reporting channel without exploit details or sensitive attachments.

Include the version, operating system and browser or Node.js version, and the smallest synthetic reproduction. A report about incorrect model results should state both the expected and actual result. Only the current release is considered for fixes; there is no guaranteed response time or support SLA.
