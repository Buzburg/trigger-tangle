import { analyze } from './engine';
import { MAX_TEXT, validateBlueprint } from './model';
import type { Analysis, Blueprint, Budget, Fields, Signal } from './types';

export type HarnessStatus = 'review-required' | 'blocked' | 'inconclusive';
export interface SignalMatch { resource: string; event: string; data?: Fields }
export interface HarnessCase {
  id: string;
  name: string;
  seed: Signal;
  required: SignalMatch[];
  forbidden?: SignalMatch[];
}
export interface HarnessSuite { version: 1; name: string; cases: HarnessCase[] }
export interface OutcomeCheck { match: SignalMatch; observed: boolean }
export interface CaseReview {
  status: HarnessStatus;
  analysisStatus: Analysis['status'];
  complete: boolean;
  reason: string;
  stats: Analysis['stats'];
  required: OutcomeCheck[];
  forbidden: OutcomeCheck[];
}
export interface HarnessReport {
  schema: 'triggertangle.harness/v1';
  name: string;
  status: HarnessStatus;
  executionAllowed: false;
  budget: Budget;
  cases: {
    id: string;
    name: string;
    seed: Signal;
    required: SignalMatch[];
    forbidden: SignalMatch[];
    baseline: CaseReview;
    candidate: CaseReview;
  }[];
  regressions: string[];
  notes: string[];
}

function object(value: unknown, at: string, allowed: string[], required: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${at} must be an object.`);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!allowed.includes(key)) throw new Error(`${at}: unsupported property ${JSON.stringify(key)}.`);
  for (const key of required) if (!Object.hasOwn(result, key)) throw new Error(`${at}.${key} is required.`);
  return result;
}

function label(value: unknown, at: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${at} must be nonempty text, at most ${max} characters, without control characters.`);
}

function list(value: unknown, at: string, min: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > 8) throw new Error(`${at} must contain ${min}–8 items.`);
  return value;
}

function validateSignal(value: unknown): Signal {
  return validateBlueprint({ version: 1, name: 'Harness signal validation', seed: value, workflows: [] }).seed;
}

function validateMatch(value: unknown, at: string): SignalMatch {
  const match = object(value, at, ['resource', 'event', 'data'], ['resource', 'event']);
  validateSignal({ resource: match.resource, event: match.event, data: Object.hasOwn(match, 'data') ? match.data : {} });
  return value as SignalMatch;
}

export function parseSuite(text: string): HarnessSuite {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Suite text exceeds 200,000 characters.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Suite is not valid JSON. Check commas, quotes and brackets.'); }
  return validateSuite(value);
}

export function validateSuite(value: unknown): HarnessSuite {
  const suite = object(value, 'Suite', ['version', 'name', 'cases'], ['version', 'name', 'cases']);
  if (suite.version !== 1) throw new Error('Only suite version 1 is supported.');
  label(suite.name, 'Suite.name', 200);
  const ids = new Set<string>();
  for (const [index, item] of list(suite.cases, 'Suite.cases', 1).entries()) {
    const at = `Suite.cases[${index}]`;
    const scenario = object(item, at, ['id', 'name', 'seed', 'required', 'forbidden'], ['id', 'name', 'seed', 'required']);
    label(scenario.id, `${at}.id`, 64); label(scenario.name, `${at}.name`, 200);
    if (ids.has(scenario.id)) throw new Error(`Duplicate scenario ID: ${JSON.stringify(scenario.id)}.`);
    ids.add(scenario.id);
    validateSignal(scenario.seed);
    for (const [checkIndex, match] of list(scenario.required, `${at}.required`, 1).entries()) validateMatch(match, `${at}.required[${checkIndex}]`);
    if (Object.hasOwn(scenario, 'forbidden')) for (const [checkIndex, match] of list(scenario.forbidden, `${at}.forbidden`, 0).entries()) validateMatch(match, `${at}.forbidden[${checkIndex}]`);
  }
  return structuredClone(value as HarnessSuite);
}

function matches(signal: Signal, match: SignalMatch): boolean {
  return signal.resource === match.resource && signal.event === match.event && Object.entries(match.data ?? {}).every(([key, value]) => Object.hasOwn(signal.data, key) && signal.data[key] === value);
}

function review(analysis: Analysis, scenario: HarnessCase): CaseReview {
  const check = (match: SignalMatch): OutcomeCheck => ({ match: structuredClone(match), observed: analysis.transitions.some(edge => matches(analysis.states[edge.to]!, match)) });
  const required = scenario.required.map(check); const forbidden = (scenario.forbidden ?? []).map(check);
  let status: HarnessStatus; let reason: string;
  if (analysis.status === 'loop-found') { status = 'blocked'; reason = analysis.reason; }
  else if (forbidden.some(outcome => outcome.observed)) { status = 'blocked'; reason = 'A forbidden emitted signal was observed in this model.'; }
  else if (!analysis.complete) { status = 'inconclusive'; reason = analysis.reason; }
  else if (required.some(outcome => !outcome.observed)) { status = 'blocked'; reason = 'The model settles, but one or more required emitted signals were not observed.'; }
  else { status = 'review-required'; reason = 'The model settles and fulfills this scenario’s declared outcomes. Operator review is still required.'; }
  return { status, analysisStatus: analysis.status, complete: analysis.complete, reason, stats: { ...analysis.stats }, required, forbidden };
}

export function rehearse(baseline: Blueprint, candidate: Blueprint, input: HarnessSuite, budget: Partial<Budget> = {}): HarnessReport {
  const suite = validateSuite(input);
  validateBlueprint(baseline); validateBlueprint(candidate);
  const designs = suite.cases.map(scenario => ({
    scenario,
    baseline: validateBlueprint({ ...baseline, seed: scenario.seed }),
    candidate: validateBlueprint({ ...candidate, seed: scenario.seed }),
  }));
  let resolvedBudget: Budget | undefined;
  const cases = designs.map(design => {
    const before = analyze(design.baseline, budget); const after = analyze(design.candidate, budget);
    resolvedBudget = before.budget;
    return { id: design.scenario.id, name: design.scenario.name, seed: structuredClone(design.scenario.seed), required: structuredClone(design.scenario.required), forbidden: structuredClone(design.scenario.forbidden ?? []), baseline: review(before, design.scenario), candidate: review(after, design.scenario) };
  });
  const status = cases.some(item => item.candidate.status === 'blocked') ? 'blocked' : cases.some(item => item.candidate.status === 'inconclusive') ? 'inconclusive' : 'review-required';
  return {
    schema: 'triggertangle.harness/v1', name: suite.name, status, executionAllowed: false, budget: resolvedBudget!, cases,
    regressions: cases.filter(item => item.baseline.status === 'review-required' && item.candidate.status !== 'review-required').map(item => item.id),
    notes: [
      'Design rehearsal only. No accounts, tools or workflows were connected or executed. No result grants execution, deployment or operating-system authority.',
      'The scenario suite must be owned and reviewed by the operator. An agent that can weaken these requirements can weaken this check.',
      'Each scenario replaces both designs’ original seed. Required and forbidden outcomes match reachable emitted signals, never the initial seed.',
      'Outcome checks establish reachability, not delivery counts or final business-record state. Multiple deliveries may merge into one unique signal state.',
      'Unobserved outputs in incomplete explorations remain unknown. Workflow and delivery totals are unavailable for loops or incomplete exploration.',
      'Results cover only these seeds and declared rules. Retries, timing, concurrency, stored records, platform behavior and LLM decisions are not modeled.',
      'Review-required means the declared model checks passed; real-platform testing and the existing approval process are still required.',
    ],
  };
}
