# Launch material

Draft copy only. Nothing here has been posted or sent. Check repository visibility and release availability before sharing these links publicly.

## One sentence

TriggerTangle rehearses how separate automations can keep waking each other up, before you connect real accounts.

## Short announcement draft

I built TriggerTangle for an awkward automation problem: two workflows can each look sensible, then create an endless round trip together.

Describe the events they listen for and emit, choose a starting event, and rehearse the combined design. TriggerTangle shows a concrete feedback cycle, lets you disable a workflow to compare the result, and exports a report you can keep with the design.

It runs offline in one HTML file, with a Node.js CLI for repeatable checks. There are no accounts, API keys, model calls, or runtime downloads.

The limit matters: it checks the rules you declare for one selected starting event. It does not connect to n8n or Zapier, prove that a live system is safe, or make changes to your automations. Incomplete exploration is labeled inconclusive.

Repository: https://github.com/Buzburg/trigger-tangle

Release: https://github.com/Buzburg/trigger-tangle/releases/tag/v0.1.0

## A useful demo

1. Load the contact round-trip example and run it.
2. Follow the event chain back to the same signal state.
3. Disable one workflow and compare the rehearsal with the baseline.
4. Try the marker-guarded example and inspect why its declared conditions stop the chain.
5. Export a report. Point out the seed, limits, and model assumptions alongside the result.

Use synthetic names and values. Exported reports contain the supplied resource IDs and event fields.

## Feedback to seek

- Can a builder describe a real feedback incident using the limited model without guessing?
- Is the explanation enough to identify which automation or condition needs inspection?
- Are the limits clear before someone uses the result to make a business decision?
- Which missing semantic feature blocks a concrete use case?

Do not claim a first-of-its-kind tool, guaranteed savings, live-platform certification, or prevention of all runaway automation. Related work and the evidence behind this build are in [RESEARCH.md](RESEARCH.md).
