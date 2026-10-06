import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSuite, rehearse, validateSuite } from '../src/harness.js';
import type { HarnessSuite } from '../src/harness.js';
import type { Blueprint, Fields, Signal, Workflow } from '../src/types.js';

const signal = (resource: string, data: Fields = {}): Signal => ({ resource, event: 'updated', data });
const flow = (id: string, from: string, to: string, options: Partial<Workflow> = {}): Workflow => ({ id, name: id, on: { resource: from, event: 'updated' }, emit: [{ resource: to, event: 'updated' }], ...options });
const blueprint = (workflows: Workflow[], seed = signal('a')): Blueprint => ({ version: 1, name: 'Test design', seed, workflows });
const suite = (from = 'a', to = 'b'): HarnessSuite => ({ version: 1, name: 'Operator requirements', cases: [{ id: 'case', name: 'Required handoff', seed: signal(from), required: [{ resource: to, event: 'updated' }] }] });

test('multi-seed guarded sync fulfills both directions while the baseline loops', () => {
  const baseline = blueprint([flow('outbound', 'a', 'b'), flow('return', 'b', 'a')]);
  const candidate = blueprint([
    flow('outbound', 'a', 'b', { when: [{ field: 'origin', op: 'notEquals', value: 'b' }], emit: [{ resource: 'b', event: 'updated', set: { origin: 'a' } }] }),
    flow('return', 'b', 'a', { when: [{ field: 'origin', op: 'notEquals', value: 'a' }], emit: [{ resource: 'a', event: 'updated', set: { origin: 'b' } }] }),
  ]);
  const scenarios = suite();
  scenarios.cases.push({ ...suite('b', 'a').cases[0]!, id: 'reverse' });
  const report = rehearse(baseline, candidate, scenarios);
  assert.equal(report.status, 'review-required');
  assert.equal(report.executionAllowed, false);
  assert.deepEqual(report.regressions, []);
  assert.ok(report.cases.every(item => item.baseline.status === 'blocked' && item.candidate.status === 'review-required'));
  assert.deepEqual(report.cases.map(item => item.candidate.stats.emittedEvents), ['1', '1']);
});

test('disabling all workflows settles but fails required work and records regression', () => {
  const before = blueprint([flow('handoff', 'a', 'b')]);
  const after = blueprint([flow('handoff', 'a', 'b', { enabled: false })]);
  const report = rehearse(before, after, suite());
  assert.equal(report.status, 'blocked');
  assert.equal(report.cases[0]!.candidate.analysisStatus, 'settles');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, false);
  assert.deepEqual(report.regressions, ['case']);
});

test('the initial seed alone cannot satisfy a required emission', () => {
  const report = rehearse(blueprint([]), blueprint([]), suite('a', 'a'));
  assert.equal(report.status, 'blocked');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, false);
});

test('a forbidden pattern matching only the initial seed does not block', () => {
  const design = blueprint([flow('out', 'a', 'b')]); const scenarios = suite();
  scenarios.cases[0]!.forbidden = [{ resource: 'a', event: 'updated' }];
  const report = rehearse(design, design, scenarios);
  assert.equal(report.status, 'review-required');
  assert.equal(report.cases[0]!.candidate.forbidden[0]!.observed, false);
});

test('a candidate cannot evade suite coverage by changing its embedded seed', () => {
  const before = blueprint([flow('handoff', 'a', 'b')], signal('unrelated'));
  const after = blueprint([flow('handoff', 'a', 'b')], signal('other'));
  const report = rehearse(before, after, suite());
  assert.equal(report.status, 'review-required');
  assert.deepEqual(report.cases[0]!.seed, signal('a'));
  assert.equal(report.cases[0]!.baseline.required[0]!.observed, true);
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, true);
});

test('a loop remains blocked even when required outputs are reached', () => {
  const looping = blueprint([flow('out', 'a', 'b'), flow('back', 'b', 'a')]);
  const report = rehearse(looping, looping, suite());
  assert.equal(report.status, 'blocked');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, true);
  assert.equal(report.cases[0]!.candidate.stats.emittedEvents, null);
});

test('an incomplete result never passes even after its required output appears', () => {
  const design = blueprint([flow('out', 'a', 'b'), flow('next', 'b', 'c')]);
  const report = rehearse(design, design, suite(), { maxTransitions: 1 });
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, true);
  assert.equal(report.cases[0]!.candidate.stats.workflowStarts, null);
  assert.deepEqual(report.budget, { maxStates: 256, maxTransitions: 1 });
});

test('missing required outputs remain unknown when exploration is incomplete', () => {
  const design = blueprint([flow('out', 'a', 'b'), flow('next', 'b', 'c')]);
  const report = rehearse(design, design, suite('a', 'c'), { maxTransitions: 1 });
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, false);
  assert.equal(report.cases[0]!.candidate.complete, false);
});

test('a forbidden emission blocks even if another branch remains unexplored', () => {
  const design = blueprint([flow('out', 'a', 'b'), flow('next', 'b', 'c')]);
  const scenarios = suite(); scenarios.cases[0]!.forbidden = [{ resource: 'b', event: 'updated' }];
  const report = rehearse(design, design, scenarios, { maxTransitions: 1 });
  assert.equal(report.status, 'blocked');
  assert.equal(report.cases[0]!.candidate.complete, false);
  assert.equal(report.cases[0]!.candidate.forbidden[0]!.observed, true);
});

test('a cycle observed before truncation remains blocked', () => {
  const design = blueprint([flow('loop', 'a', 'a'), flow('other', 'a', 'b')]);
  const report = rehearse(design, design, suite('a', 'a'), { maxTransitions: 1 });
  assert.equal(report.status, 'blocked');
  assert.equal(report.cases[0]!.candidate.complete, false);
  assert.equal(report.cases[0]!.candidate.analysisStatus, 'loop-found');
});

test('subset matches preserve null, missing fields, scalar types and exact addresses', () => {
  const design = blueprint([flow('out', 'a', 'b')], signal('a', { extra: 'kept', value: null, flag: false, count: 0 }));
  const scenarios = suite();
  scenarios.cases[0]!.seed = design.seed;
  scenarios.cases[0]!.required[0]!.data = { value: null, flag: false, count: 0 };
  scenarios.cases[0]!.forbidden = [
    { resource: 'b', event: 'updated', data: { absent: null } },
    { resource: 'b', event: 'updated', data: { flag: 0 } },
    { resource: 'b', event: 'updated', data: { count: '0' } },
    { resource: 'B', event: 'updated' },
    { resource: 'b', event: 'Updated' },
  ];
  const report = rehearse(design, design, scenarios);
  assert.equal(report.status, 'review-required');
  assert.ok(report.cases[0]!.candidate.forbidden.every(item => !item.observed));
});

test('reconverging branches preserve exact duplicate delivery totals', () => {
  const design = blueprint([
    flow('split', 'a', 'b', { emit: [{ resource: 'b', event: 'updated' }, { resource: 'c', event: 'updated' }] }),
    flow('left', 'b', 'd'), flow('right', 'c', 'd'), flow('join', 'd', 'e'),
  ]);
  const report = rehearse(design, design, suite('a', 'e'));
  assert.equal(report.status, 'review-required');
  assert.equal(report.cases[0]!.candidate.required[0]!.observed, true);
  assert.equal(report.cases[0]!.candidate.stats.states, 5);
  assert.equal(report.cases[0]!.candidate.stats.emittedEvents, '6');
});

test('large exact delivery totals stay decimal strings without numeric rounding', () => {
  const workflows = Array.from({ length: 64 }, (_, index) => flow(String(index), `node${index}`, `node${index + 1}`, {
    emit: [{ resource: `node${index + 1}`, event: 'updated' }, { resource: `node${index + 1}`, event: 'updated' }],
  }));
  const design = blueprint(workflows, signal('node0'));
  const report = rehearse(design, design, suite('node0', 'node64'));
  assert.equal(report.status, 'review-required');
  assert.equal(report.cases[0]!.candidate.stats.emittedEvents, ((2n ** 65n) - 2n).toString());
  assert.equal(report.cases[0]!.candidate.stats.workflowStarts, ((2n ** 64n) - 1n).toString());
});

test('previously fulfilled scenarios becoming inconclusive are reported as regressions', () => {
  const before = blueprint([flow('out', 'a', 'b')]);
  const after = blueprint([flow('out', 'a', 'b'), flow('extra', 'b', 'c')]);
  const report = rehearse(before, after, suite(), { maxTransitions: 1 });
  assert.equal(report.cases[0]!.baseline.status, 'review-required');
  assert.equal(report.status, 'inconclusive');
  assert.deepEqual(report.regressions, ['case']);
});

test('reports do not mutate or retain mutable references to their inputs', () => {
  const design = blueprint([flow('out', 'a', 'b')]); const scenarios = suite();
  const saved = JSON.stringify({ design, scenarios });
  const report = rehearse(design, design, scenarios);
  assert.equal(JSON.stringify({ design, scenarios }), saved);
  scenarios.cases[0]!.seed.resource = 'changed'; scenarios.cases[0]!.required[0]!.resource = 'changed';
  assert.equal(report.cases[0]!.seed.resource, 'a');
  assert.equal(report.cases[0]!.required[0]!.resource, 'b');
  assert.equal(report.cases[0]!.candidate.required[0]!.match.resource, 'b');
});

test('overall blocked takes precedence over other inconclusive scenarios', () => {
  const design = blueprint([flow('out', 'a', 'b'), flow('next', 'b', 'c')]); const scenarios = suite();
  scenarios.cases.push({ ...suite('z', 'none').cases[0]!, id: 'blocked' });
  const report = rehearse(design, design, scenarios, { maxTransitions: 1 });
  assert.deepEqual(report.cases.map(item => item.candidate.status), ['inconclusive', 'blocked']);
  assert.equal(report.status, 'blocked');
});

test('each overridden design preserves the model’s combined 32-field limit', () => {
  const fields: Fields = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`field${index}`, index]));
  const design = blueprint([flow('out', 'a', 'b', { emit: [{ resource: 'b', event: 'updated', set: fields }] })]);
  const scenarios = suite(); scenarios.cases[0]!.seed.data = { extra: true };
  assert.throws(() => rehearse(design, design, scenarios), /32 distinct/);
});

test('budget limits remain enforced by the existing engine', () => {
  const design = blueprint([flow('out', 'a', 'b')]);
  for (const budget of [{ maxStates: 0 }, { maxStates: 513 }, { maxTransitions: 8193 }, { maxTransitions: 1.5 }]) assert.throws(() => rehearse(design, design, suite(), budget), /Budget/);
});

test('suite parsing enforces JSON and text length limits', () => {
  assert.deepEqual(parseSuite(JSON.stringify(suite())), suite());
  assert.throws(() => parseSuite('{'), /valid JSON/);
  assert.throws(() => parseSuite(' '.repeat(200_001)), /200,000/);
});

test('suite validation rejects empty checks, duplicate IDs and excessive lists', () => {
  const emptyCases = suite(); emptyCases.cases = []; assert.throws(() => validateSuite(emptyCases), /1–8/);
  const emptyRequired = suite(); emptyRequired.cases[0]!.required = []; assert.throws(() => validateSuite(emptyRequired), /1–8/);
  const duplicate = suite(); duplicate.cases.push(structuredClone(duplicate.cases[0]!)); assert.throws(() => validateSuite(duplicate), /Duplicate scenario/);
  const tooManyCases = suite(); tooManyCases.cases = Array.from({ length: 9 }, (_, index) => ({ ...suite().cases[0]!, id: String(index) })); assert.throws(() => validateSuite(tooManyCases), /1–8/);
  const tooManyRequired = suite(); tooManyRequired.cases[0]!.required = Array.from({ length: 9 }, () => ({ resource: 'b', event: 'updated' })); assert.throws(() => validateSuite(tooManyRequired), /1–8/);
  const tooManyForbidden = suite(); tooManyForbidden.cases[0]!.forbidden = tooManyRequired.cases[0]!.required; assert.throws(() => validateSuite(tooManyForbidden), /0–8/);
});

test('maximum case and check counts are accepted and reviewed', () => {
  const scenarios = suite();
  scenarios.cases = Array.from({ length: 8 }, (_, index) => ({
    ...suite().cases[0]!, id: String(index),
    required: Array.from({ length: 8 }, () => ({ resource: 'b', event: 'updated' })),
    forbidden: Array.from({ length: 8 }, () => ({ resource: 'never', event: 'updated' })),
  }));
  const design = blueprint([flow('out', 'a', 'b')]);
  assert.equal(rehearse(design, design, scenarios).status, 'review-required');
});

test('suite validation rejects unsupported properties at each boundary', () => {
  const original = suite(); const scenario = original.cases[0]!;
  for (const value of [
    { ...original, execute: true },
    { ...original, cases: [{ ...scenario, approve: true }] },
    { ...original, cases: [{ ...scenario, seed: { ...scenario.seed, extra: true } }] },
    { ...original, cases: [{ ...scenario, required: [{ ...scenario.required[0], optional: true }] }] },
    { ...original, cases: [{ ...scenario, forbidden: [{ resource: 'b', event: 'updated', optional: true }] }] },
  ]) assert.throws(() => validateSuite(value), /unsupported property/);
});

test('suite validation preserves model scalar, address, field and label constraints', () => {
  const original = suite(); const scenario = original.cases[0]!;
  for (const value of [
    { ...original, version: 2 }, { ...original, name: '' }, { ...original, name: 'x'.repeat(201) },
    { ...original, cases: [{ ...scenario, id: 'x'.repeat(65) }] },
    { ...original, cases: [{ ...scenario, name: 'bad\nname' }] },
    { ...original, cases: [{ ...scenario, seed: signal('') }] },
    { ...original, cases: [{ ...scenario, required: [{ resource: 'b', event: 'updated', data: { value: [] } }] }] },
    { ...original, cases: [{ ...scenario, required: [{ resource: 'b', event: 'updated', data: { value: 1.1 } }] }] },
    { ...original, cases: [{ ...scenario, required: [{ resource: 'b', event: 'updated', data: { constructor: 'bad' } }] }] },
    { ...original, cases: [{ ...scenario, required: [{ resource: 'b', event: 'updated', data: undefined }] }] },
    { ...original, cases: [{ ...scenario, forbidden: undefined }] },
  ]) assert.throws(() => validateSuite(value));
  assert.throws(() => validateSuite(Object.create(null)));
});
