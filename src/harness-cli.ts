import { createHash } from 'node:crypto';
import { parseSuite, rehearse } from './harness';
import { parseBlueprint } from './model';
import { readInput } from './read-input';
import { VERSION } from './version';
import type { Budget } from './types';

const HELP = `TriggerTangle Harness ${VERSION} — review a proposed workflow change

Usage: node trigger-tangle-harness.mjs --baseline before.json --candidate after.json --suite scenarios.json

--max-states N       Per-scenario budget, 1–512 (default 256)
--max-transitions N  Per-scenario budget, 1–8192 (default 2048)
--help              Show this help

JSON goes to stdout. Exit 0: review-required; 1: blocked; 2: inconclusive;
3: invalid input/error. Exit 0 never grants approval or execution authority.
The operator owns the suite; candidate changes must not edit its requirements.
Tests declared emitted outcomes for up to 8 separate starting events.
No accounts, model calls, commands from inputs, or workflow execution.
Inputs remain unchanged. Reports contain the supplied inputs and sample data.
`;

async function main(args: string[]): Promise<void> {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]!)) {
    process.stdout.write(HELP);
    return;
  }
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!;
    if (!['--baseline', '--candidate', '--suite', '--max-states', '--max-transitions'].includes(option)) throw new Error(`Unknown option: ${JSON.stringify(option)}.`);
    if (options.has(option)) throw new Error(`Repeated option: ${option}.`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}.`);
    options.set(option, value);
  }
  const baselinePath = options.get('--baseline');
  const candidatePath = options.get('--candidate');
  const suitePath = options.get('--suite');
  if (!baselinePath || !candidatePath || !suitePath) throw new Error('Supply --baseline, --candidate and an operator-owned --suite.');
  const budget: Partial<Budget> = {};
  for (const [option, field] of [['--max-states', 'maxStates'], ['--max-transitions', 'maxTransitions']] as const) {
    const value = options.get(option);
    if (value !== undefined) {
      if (!/^\d+$/.test(value)) throw new Error(`${option} must be a whole number.`);
      budget[field] = Number(value);
    }
  }
  const [baselineText, candidateText, suiteText] = await Promise.all([baselinePath, candidatePath, suitePath].map(readInput));
  const baseline = parseBlueprint(baselineText!);
  const candidate = parseBlueprint(candidateText!);
  const suite = parseSuite(suiteText!);
  const report = rehearse(baseline, candidate, suite, budget);
  const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
  process.stdout.write(`${JSON.stringify({
    ...report,
    evidence: {
      runnerVersion: VERSION,
      baselineTextSha256: digest(baselineText!),
      candidateTextSha256: digest(candidateText!),
      suiteTextSha256: digest(suiteText!),
    },
    inputs: { baseline, candidate, suite },
  }, null, 2)}\n`);
  process.exitCode = report.status === 'review-required' ? 0 : report.status === 'blocked' ? 1 : 2;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`TriggerTangle Harness: ${JSON.stringify(error instanceof Error ? error.message : 'Rehearsal failed.')}\n`);
  process.exitCode = 3;
});
