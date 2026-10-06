# Why TriggerTangle

Research date: 6 October 2026. This is a small product hypothesis, not proof of novelty or future adoption.

## The problem

Two useful automations can keep triggering each other through a shared application. Reviewing either workflow alone can miss the combined behavior. The first question is simple: given one event and these declared rules, does the chain stop?

Evidence from the platforms and their users:

- [Zapier: Zap is stuck in a loop](https://help.zapier.com/hc/en-us/articles/8496232045453-Zap-is-stuck-in-a-loop) documents two-workflow loops, self-triggering updates, and email auto-reply loops. It recommends explicit markers and filters or checking whether a record already exists.
- [Zoho: using fetch actions](https://help.zoho.com/portal/en/kb/flow/community-learning-series/articles/how-to-use-fetch-actions-in-zoho-flow) describes reverse CRM and Books flows repeatedly creating contacts and consuming tasks. Its example adds a lookup and decision before creation.
- [Zapier customer incident](https://community.zapier.com/troubleshooting-99/title-suggestion-recursion-issue-in-zap-consumed-52k-tasks-and-blocked-support-response-50256): a customer reports a recursive automation consuming 52,485 tasks and costing over $700. Those figures are the customer's account, not an independently audited measurement.
- [n8n community discussion](https://community.n8n.io/t/how-are-you-handling-infinite-loop-protection-in-production-n8n-workflows/279286) describes self-triggering webhooks and unbounded retries consuming API credits, with users discussing runtime circuit breakers.

These sources establish a recurring failure mode. They do not establish demand for this particular implementation.

## Existing work and the chosen boundary

| Existing work | What already exists | TriggerTangle's narrower focus |
| --- | --- | --- |
| [Entflow](https://entflow.app/blog/detecting-fixing-circular-dependencies-hubspot-workflow-sequences) | HubSpot workflow dependency mapping, conflict detection, and related guidance | An offline rehearsal of a small, explicitly declared design across arbitrary named resources; no account connection |
| [n8n Visualizer](https://github.com/TobiasMende/n8n-visualizer) | Maps an n8n instance or JSON export, including explicit subworkflow calls, HTTP-to-webhook links, and error workflows | Explores declared event fields and guards from one seed, rather than inferring an instance's dependency map |
| [TAPInspector](https://arxiv.org/abs/2102.01468) | Established research on safety and liveness verification of interacting trigger-action IoT rules, including concurrency and latency | A deliberately limited, stateless event model for a portable design rehearsal; no claim to replace its richer verification |
| [IAL-Scan](https://arxiv.org/abs/2607.01641) | Research on static detection of unbounded loops in agent projects, using an intermediate representation and dependence graph | Declared event rules and a concrete seed, without source-code inference |
| [n8n workflow validator](https://github.com/yigitkonur/n8n-workflow-validator) | Export validation using actual n8n runtime packages | The behavior of several declared automations together, rather than validating a platform export |
| [agent-crash-test](https://github.com/pavloparaschakis/agent-crash-test) | Agent failure testing and effect contracts | No agent execution, proxying, live effects, or injected runtime failures |
| [CronScope](https://github.com/SysAdminDoc/CronScope) | Client-side cron simulation and schedule conflict detection | Event feedback rather than calendar scheduling |

Cycle detection and model checking are established techniques. We do not claim to have invented them, or to have found every competing product. The proposed distinction is the packaging: a portable offline app plus CLI that explains a reachable event cycle, shows the effect of disabling a workflow, and states when exploration is incomplete.

## A falsifiable product claim

Given two rules, `CRM/contact.created -> Contacts/contact.created` and the reverse, TriggerTangle should show a cycle reachable from a matching seed. If the declared rules instead add and check an origin marker that stops the return trip, the model should settle. Changing resource IDs or the seed can change that result. Reconnecting branches without a returning path must not count as a loop.

This is deliberately smaller than a production simulator. The model cannot infer a platform's retries, persistent records, delivery behavior, concurrency, or arbitrary conditions. v0.1 does not import n8n or Zapier exports: unsupported details must not silently become invented semantics. A user supplies the relevant rules in the [documented model](DESIGN.md).

## How to judge the idea

Useful evidence would be an automation builder reproducing a known cross-workflow incident, finding the explanation understandable, and identifying an intervention to test in their actual platform. A screenshot or a successful synthetic sample alone is not evidence of production effectiveness. Popularity and willingness to adopt remain untested.
