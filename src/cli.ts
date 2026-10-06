import { analyze } from './engine';
import { parseBlueprint } from './model';
import { htmlReport } from './report';
import { readInput } from './read-input';
import { EXAMPLES } from './examples';
import type { Budget } from './types';

const HELP = `TriggerTangle 0.1.0 — cross-workflow design rehearsal

Usage: node trigger-tangle.mjs blueprint.json [options]
       node trigger-tangle.mjs --example contact-loop [options]

--format text|json|html  Output to stdout (default text)
--disable WORKFLOW_ID   Disable a workflow for this rehearsal; repeatable
--max-states N          Unique-state budget, 1–512 (default 256)
--max-transitions N     Edge budget, 1–8192 (default 2048)
--blueprint             Print the selected blueprint as JSON
--help                  Show this help

Examples: contact-loop, guarded-sync, self-reply, fan-out.
Exit: 0 settles, 1 loop found in model, 2 inconclusive, 3 invalid input/error.
No accounts connected. No workflow or source file changed. One seed only.
Keep input files stable during the check. Reports may contain private data.
`;
async function main(args: string[]): Promise<void> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) { process.stdout.write(HELP); return; }
  let source: string | undefined; let example: string | undefined; let format = 'text'; let blueprintOnly = false;
  const disabled = new Set<string>(); const seen = new Set<string>(); const budget: Partial<Budget> = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === '--blueprint') { if (blueprintOnly) throw new Error('Repeated --blueprint option.'); blueprintOnly = true; continue; }
    if (['--format', '--example', '--disable', '--max-states', '--max-transitions'].includes(arg)) {
      if (seen.has(arg) && arg !== '--disable') throw new Error(`Repeated option: ${arg}.`);
      seen.add(arg); const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--format') format = value;
      else if (arg === '--example') example = value;
      else if (arg === '--disable') disabled.add(value);
      else {
        if (!/^\d+$/.test(value)) throw new Error(`${arg} must be a whole number.`);
        budget[arg === '--max-states' ? 'maxStates' : 'maxTransitions'] = Number(value);
      }
    } else { if (source || arg.startsWith('-')) throw new Error(`Unexpected argument: ${JSON.stringify(arg)}.`); source = arg; }
  }
  if ((!source && !example) || (source && example)) throw new Error('Choose exactly one blueprint file or --example.');
  if (!['text', 'json', 'html'].includes(format)) throw new Error('Format must be text, json or html.');
  const builtin = example ? EXAMPLES.find(item => item.id === example) : undefined;
  if (example && !builtin) throw new Error('Unknown example. Use --help for the list.');
  const blueprint = builtin ? structuredClone(builtin.blueprint) : parseBlueprint(await readInput(source!));
  for (const id of disabled) {
    const workflow = blueprint.workflows.find(item => item.id === id);
    if (!workflow) throw new Error(`Unknown workflow ID: ${JSON.stringify(id)}.`);
    workflow.enabled = false;
  }
  const report = analyze(blueprint, budget);
  if (blueprintOnly) { process.stdout.write(`${JSON.stringify(blueprint, null, 2)}\n`); return; }
  const output = format === 'json' ? JSON.stringify(report, null, 2) : format === 'html' ? htmlReport(report) : [
    `TriggerTangle: ${report.status.toUpperCase()} — ${JSON.stringify(report.name)}`,
    report.reason,
    `${report.stats.states} unique states; ${report.stats.transitions} edges; exploration ${report.complete ? 'complete' : 'incomplete'}.`,
    `Modeled workflow starts: ${report.stats.workflowStarts ?? 'unavailable'}; emitted deliveries: ${report.stats.emittedEvents ?? 'unavailable'}.`,
    ...(report.witness ? [...report.witness.leadIn.map(edge => ({ edge, label: 'LEAD-IN' })), ...report.witness.cycle.map(edge => ({ edge, label: 'CYCLE' }))].map(({ edge, label }) => {
      const from = report.states[edge.from]!; const to = report.states[edge.to]!;
      return `${label} ${JSON.stringify(edge.workflow)}: ${JSON.stringify([from.resource, from.event, from.data])} -> ${JSON.stringify([to.resource, to.event, to.data])}`;
    }) : []),
    ...report.notes,
  ].join('\n');
  process.stdout.write(`${output}\n`);
  process.exitCode = report.status === 'settles' ? 0 : report.status === 'loop-found' ? 1 : 2;
}
main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`TriggerTangle: ${JSON.stringify(error instanceof Error ? error.message : 'Rehearsal failed.')}\n`); process.exitCode = 3;
});
