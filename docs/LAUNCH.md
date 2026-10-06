# Launch material

Draft copy only. Nothing here has been posted or sent. Check repository visibility and release availability before sharing these links publicly.

## One sentence

TriggerTangle rehearses how separate automations can keep waking each other up, before you connect real accounts.

## Short announcement draft

I built TriggerTangle for an awkward automation problem: two workflows can each look sensible, then create an endless round trip together.

Name two resources and choose their event in the new sync builder; no JSON is needed for that first rehearsal. TriggerTangle shows a concrete feedback cycle, lets you try an origin marker or disable a workflow, and exports a report you can keep with the design. Larger designs use explicit JSON blueprints.

It runs offline in one HTML file, with a Node.js CLI for repeatable checks. There are no accounts, API keys, model calls, or runtime downloads.

The limit matters: it checks the rules you declare for one selected starting event. It does not connect to n8n or Zapier, prove that a live system is safe, or make changes to your automations. Incomplete exploration is labeled inconclusive.

Repository: https://github.com/Buzburg/trigger-tangle

Browser demo: https://buzburg.github.io/trigger-tangle/

Release: https://github.com/Buzburg/trigger-tangle/releases/latest

This is a general draft for a channel that permits AI-assisted writing and project promotion. Do not paste it into Hacker News, whose current rules prohibit generated text. Verify the intended channel first; see [the launch assistant plan](GROWTH.md).

## A useful demo

1. Load the contact round-trip example and run it.
2. Follow the event chain back to the same signal state.
3. Disable one workflow and compare the rehearsal with the baseline.
4. Try the marker-guarded example and inspect why its declared conditions stop the chain.
5. Export a report. Point out the seed, limits, and model assumptions alongside the result.

Use synthetic names and values. Exported reports contain the supplied resource IDs and event fields.

## Thirty-second recording outline

- 0–5 seconds: show the default contact loop. Caption: “Two sensible workflows. One repeating round trip.”
- 5–15 seconds: open the builder; name `demo-crm/contacts` and `demo-sheet/contacts`; build the unguarded sync.
- 15–23 seconds: enable the origin marker, build again, and show the one-hop result. Caption: “In this declared model, the marker stops changes returning.”
- 23–30 seconds: show the readable report and model limits. Caption: “Try your own rules. Free offline app. No account connection.”

Record the real interface. Do not add invented savings, customer endorsements, download counts or claims of live-platform protection.

## Feedback to seek

- Can a builder describe a real feedback incident using the limited model without guessing?
- Is the explanation enough to identify which automation or condition needs inspection?
- Are the limits clear before someone uses the result to make a business decision?
- Which missing semantic feature blocks a concrete use case?

Do not claim a first-of-its-kind tool, guaranteed savings, live-platform certification, or prevention of all runaway automation. Related work and the evidence behind this build are in [RESEARCH.md](RESEARCH.md).
