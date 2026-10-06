import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze } from '../src/engine.js';
import type { Analysis, Blueprint, Condition, Effect, Fields, Workflow } from '../src/types.js';

function workflow(id: string, from: string, to: string, options: Partial<Workflow> = {}): Workflow {
  return { id, name: id, on: { resource: from, event: 'updated' }, emit: [{ resource: to, event: 'updated' }], ...options };
}

function blueprint(workflows: Workflow[], data: Fields = {}, resource = 'a'): Blueprint {
  return { version: 1, name: 'Test rehearsal', seed: { resource, event: 'updated', data }, workflows };
}

function assertWitness(result: Analysis): void {
  assert.ok(result.witness);
  const { leadIn, cycle } = result.witness;
  assert.ok(cycle.length > 0);
  let current = 0;
  for (const edge of leadIn) {
    assert.equal(edge.from, current);
    assert.ok(result.transitions.some((candidate) => JSON.stringify(candidate) === JSON.stringify(edge)));
    current = edge.to;
  }
  const entry = current;
  for (const edge of cycle) {
    assert.equal(edge.from, current);
    assert.ok(result.transitions.some((candidate) => JSON.stringify(candidate) === JSON.stringify(edge)));
    current = edge.to;
  }
  assert.equal(current, entry, 'the witness must return to its cycle entry');
}

test('an unmatched seed settles with no workflow starts or emissions', () => {
  const result = analyze(blueprint([]));
  assert.equal(result.status, 'settles');
  assert.equal(result.complete, true);
  assert.equal(result.stats.workflowStarts, '0');
  assert.equal(result.stats.emittedEvents, '0');
  assert.equal(result.witness, null);
});

test('a matching sink workflow starts once without emitting an event', () => {
  const result = analyze(blueprint([workflow('sink', 'a', 'b', { emit: [] })]));
  assert.equal(result.status, 'settles');
  assert.equal(result.stats.workflowStarts, '1');
  assert.equal(result.stats.emittedEvents, '0');
});

test('stateless contact ping-pong has an executable cycle witness', () => {
  const result = analyze(blueprint([workflow('crm-sheet', 'a', 'b'), workflow('sheet-crm', 'b', 'a')]));
  assert.equal(result.status, 'loop-found');
  assert.equal(result.complete, true);
  assert.equal(result.stats.workflowStarts, null);
  assert.equal(result.stats.emittedEvents, null);
  assertWitness(result);
});

test('a self-trigger is a one-edge cycle', () => {
  const result = analyze(blueprint([workflow('self', 'a', 'a')]));
  assert.equal(result.status, 'loop-found');
  assert.equal(result.witness?.cycle.length, 1);
  assertWitness(result);
});

test('cycle witnesses include a reachable lead-in, not an unrelated graph cycle', () => {
  const result = analyze(blueprint([
    workflow('entry', 'a', 'b'), workflow('next', 'b', 'c'), workflow('back', 'c', 'b'),
    workflow('unreachable', 'z', 'z'),
  ]));
  assert.equal(result.status, 'loop-found');
  assert.equal(result.witness?.leadIn.length, 1);
  assert.ok(result.states.every((state) => state.resource !== 'z'));
  assertWitness(result);
});

test('a diamond reconverges without becoming a loop and counts both deliveries', () => {
  const result = analyze(blueprint([
    workflow('split', 'a', 'b', { emit: [{ resource: 'b', event: 'updated' }, { resource: 'c', event: 'updated' }] }),
    workflow('left', 'b', 'd'), workflow('right', 'c', 'd'), workflow('join', 'd', 'e'),
  ]));
  assert.equal(result.status, 'settles');
  assert.equal(result.stats.states, 5);
  assert.equal(result.stats.transitions, 5);
  assert.equal(result.stats.workflowStarts, '5');
  assert.equal(result.stats.emittedEvents, '6');
  assert.equal(result.witness, null);
});

test('origin marker guards stop ping-pong under the declared field propagation', () => {
  const result = analyze(blueprint([
    workflow('outbound', 'a', 'b', { emit: [{ resource: 'b', event: 'updated', set: { origin: 'crm' } }] }),
    workflow('return', 'b', 'a', { when: [{ field: 'origin', op: 'notEquals', value: 'crm' }] }),
  ]));
  assert.equal(result.status, 'settles');
  assert.equal(result.stats.workflowStarts, '1');
  assert.equal(result.stats.emittedEvents, '1');
});

test('a guard checking the wrong marker still exposes the loop', () => {
  const result = analyze(blueprint([
    workflow('outbound', 'a', 'b', { emit: [{ resource: 'b', event: 'updated', set: { origin: 'crm' } }] }),
    workflow('return', 'b', 'a', { when: [{ field: 'origin', op: 'notEquals', value: 'sheet' }] }),
  ]));
  assert.equal(result.status, 'loop-found');
  assertWitness(result);
});

test('resource and event identifiers match exactly, including case and whitespace', () => {
  const result = analyze(blueprint([
    workflow('case', 'A', 'a'), workflow('whitespace', 'a ', 'a'),
    workflow('event', 'a', 'a', { on: { resource: 'a', event: 'Updated' } }),
    workflow('disabled', 'a', 'a', { enabled: false }),
  ]));
  assert.equal(result.status, 'settles');
  assert.equal(result.stats.workflowStarts, '0');
});

const conditionCases: { name: string; data: Fields; condition: Condition; expected: string }[] = [
  { name: 'null exists', data: { value: null }, condition: { field: 'value', op: 'exists' }, expected: '1' },
  { name: 'missing does not exist', data: {}, condition: { field: 'value', op: 'exists' }, expected: '0' },
  { name: 'null is not missing', data: { value: null }, condition: { field: 'value', op: 'missing' }, expected: '0' },
  { name: 'absent is missing', data: {}, condition: { field: 'value', op: 'missing' }, expected: '1' },
  { name: 'missing is not equal to null', data: {}, condition: { field: 'value', op: 'equals', value: null }, expected: '0' },
  { name: 'missing is notEquals null', data: {}, condition: { field: 'value', op: 'notEquals', value: null }, expected: '1' },
  { name: 'null equals null', data: { value: null }, condition: { field: 'value', op: 'equals', value: null }, expected: '1' },
  { name: 'false is not zero', data: { value: false }, condition: { field: 'value', op: 'equals', value: 0 }, expected: '0' },
  { name: 'number is not a numeric string', data: { value: 1 }, condition: { field: 'value', op: 'equals', value: '1' }, expected: '0' },
];
for (const { name, data, condition, expected } of conditionCases) {
  test(`condition semantics: ${name}`, () => {
    const result = analyze(blueprint([workflow('check', 'a', 'b', { when: [condition], emit: [] })], data));
    assert.equal(result.stats.workflowStarts, expected);
  });
}

test('all conditions must match', () => {
  const result = analyze(blueprint([workflow('check', 'a', 'b', {
    when: [{ field: 'x', op: 'exists' }, { field: 'x', op: 'equals', value: 'no' }], emit: [],
  })], { x: 'yes' }));
  assert.equal(result.stats.workflowStarts, '0');
});

test('sibling effects and sibling workflows each inherit the untouched input', () => {
  const result = analyze(blueprint([
    workflow('split', 'a', 'b', { emit: [
      { resource: 'b', event: 'updated', unset: ['remove'], set: { marker: 'left' } },
      { resource: 'c', event: 'updated', set: { marker: 'right' } },
    ] }),
    workflow('sibling', 'a', 'd'),
  ], { remove: 'keep elsewhere', marker: 'original' }));
  assert.deepEqual(result.states.find((state) => state.resource === 'b')?.data, { marker: 'left' });
  assert.deepEqual(result.states.find((state) => state.resource === 'c')?.data, { marker: 'right', remove: 'keep elsewhere' });
  assert.deepEqual(result.states.find((state) => state.resource === 'd')?.data, { marker: 'original', remove: 'keep elsewhere' });
});

test('an effect removes fields before setting them', () => {
  const result = analyze(blueprint([workflow('replace', 'a', 'b', {
    emit: [{ resource: 'b', event: 'updated', unset: ['x'], set: { x: null } }],
  })], { x: 'before' }));
  assert.deepEqual(result.states.find((state) => state.resource === 'b')?.data, { x: null });
});

test('field insertion order does not create fake states', () => {
  const result = analyze(blueprint([workflow('self', 'a', 'a', {
    emit: [{ resource: 'a', event: 'updated', unset: ['a'], set: { a: 1 } }],
  })], { a: 1, b: 2 }));
  assert.equal(result.stats.states, 1);
  assert.equal(result.status, 'loop-found');
});

test('distinct signal and scalar identities do not collide under serialization', () => {
  const emit: Effect[] = [
    { resource: 'b', event: 'updated', set: { value: 1 } },
    { resource: 'b', event: 'updated', set: { value: '1' } },
    { resource: 'b', event: 'updated', set: { value: null } },
    { resource: 'b', event: 'updated', unset: ['value'] },
    { resource: 'b|updated', event: 'x' },
    { resource: 'b', event: 'updated|x' },
  ];
  const result = analyze(blueprint([workflow('split', 'a', 'b', { emit })]));
  assert.equal(result.stats.states, 7);
  assert.equal(result.stats.emittedEvents, '6');
});

test('duplicate effects are separate deliveries and multiply downstream starts', () => {
  const result = analyze(blueprint([
    workflow('twice', 'a', 'b', { emit: [{ resource: 'b', event: 'updated' }, { resource: 'b', event: 'updated' }] }),
    workflow('sink', 'b', 'c', { emit: [] }),
  ]));
  assert.equal(result.stats.states, 2);
  assert.equal(result.stats.transitions, 2);
  assert.equal(result.stats.emittedEvents, '2');
  assert.equal(result.stats.workflowStarts, '3');
});

test('DAG delivery counts retain integer precision beyond Number.MAX_SAFE_INTEGER', () => {
  const workflows: Workflow[] = [];
  let starts = 0n;
  let emitted = 0n;
  for (let level = 0; level < 14; level++) {
    workflows.push(workflow(`level-${level}`, `r${level}`, `r${level + 1}`, {
      emit: Array.from({ length: 16 }, () => ({ resource: `r${level + 1}`, event: 'updated' })),
    }));
    starts += 16n ** BigInt(level);
    emitted += 16n ** BigInt(level + 1);
  }
  const result = analyze(blueprint(workflows, {}, 'r0'));
  assert.equal(result.status, 'settles');
  assert.equal(result.stats.workflowStarts, starts.toString());
  assert.equal(result.stats.emittedEvents, emitted.toString());
  assert.ok(emitted > BigInt(Number.MAX_SAFE_INTEGER));
});

test('state and transition budget exhaustion are inconclusive without a cycle', () => {
  const input = blueprint([workflow('first', 'a', 'b'), workflow('second', 'b', 'c')]);
  for (const budget of [{ maxStates: 2 }, { maxTransitions: 1 }]) {
    const result = analyze(input, budget);
    assert.equal(result.status, 'inconclusive');
    assert.equal(result.complete, false);
    assert.equal(result.stats.workflowStarts, null);
    assert.equal(result.stats.emittedEvents, null);
    assert.equal(result.witness, null);
  }
});

test('exactly filling a budget is complete when nothing remains unexplored', () => {
  const result = analyze(blueprint([workflow('only', 'a', 'b')]), { maxStates: 2, maxTransitions: 1 });
  assert.equal(result.status, 'settles');
  assert.equal(result.complete, true);
  const empty = analyze(blueprint([]), { maxStates: 1, maxTransitions: 1 });
  assert.equal(empty.status, 'settles');
  assert.equal(empty.complete, true);
});

test('a valid cycle in a partial graph remains a loop witness with incomplete coverage', () => {
  const result = analyze(blueprint([workflow('split', 'a', 'a', {
    emit: [{ resource: 'a', event: 'updated' }, { resource: 'b', event: 'updated' }],
  })]), { maxStates: 1 });
  assert.equal(result.status, 'loop-found');
  assert.equal(result.complete, false);
  assertWitness(result);
});

test('exploration is breadth-first and output is deterministic', () => {
  const input = blueprint([
    workflow('split', 'a', 'b', { emit: [{ resource: 'b', event: 'updated' }, { resource: 'c', event: 'updated' }] }),
    workflow('deeper', 'b', 'd'),
  ]);
  const first = analyze(input);
  assert.deepEqual(first.states.map((state) => state.resource), ['a', 'b', 'c', 'd']);
  assert.deepEqual(analyze(input), first);
});

test('analysis does not mutate the blueprint, conditions or effects', () => {
  const input = blueprint([workflow('change', 'a', 'b', {
    when: [{ field: 'x', op: 'exists' }],
    emit: [{ resource: 'b', event: 'updated', unset: ['x'], set: { y: 'after' } }],
  })], { x: 'before' });
  const saved = structuredClone(input);
  analyze(input);
  assert.deepEqual(input, saved);
});

test('template-looking values are inert scalar data', () => {
  const value = '={{ process.exit(1) }}';
  const result = analyze(blueprint([workflow('literal', 'a', 'b', { when: [{ field: 'x', op: 'equals', value }], emit: [] })], { x: value }));
  assert.equal(result.stats.workflowStarts, '1');
});

test('invalid or excessive exploration budgets are rejected', () => {
  for (const budget of [
    { maxStates: 0 }, { maxStates: -1 }, { maxStates: 1.5 }, { maxStates: 513 },
    { maxStates: Number.NaN }, { maxTransitions: 0 }, { maxTransitions: 8193 },
    { maxTransitions: Number.POSITIVE_INFINITY },
  ]) assert.throws(() => analyze(blueprint([]), budget));
});

test('all 512 three-node directed graphs agree with an independent reachability oracle', () => {
  for (let mask = 0; mask < 512; mask++) {
    const reachable = Array.from({ length: 3 }, (_, from) => Array.from({ length: 3 }, (_, to) => Boolean(mask & (1 << (from * 3 + to)))));
    const workflows: Workflow[] = [];
    for (let from = 0; from < 3; from++) {
      const emit = reachable[from]!.flatMap((edge, to) => edge ? [{ resource: `r${to}`, event: 'updated' }] : []);
      workflows.push(workflow(`w${from}`, `r${from}`, '', { emit }));
    }
    for (let via = 0; via < 3; via++) for (let from = 0; from < 3; from++) for (let to = 0; to < 3; to++) {
      reachable[from]![to] = reachable[from]![to]! || (reachable[from]![via]! && reachable[via]![to]!);
    }
    const hasReachableCycle = reachable.some((row, node) => row[node] && (node === 0 || reachable[0]![node]));
    const result = analyze(blueprint(workflows, {}, 'r0'));
    assert.equal(result.complete, true);
    assert.equal(result.status, hasReachableCycle ? 'loop-found' : 'settles', `graph mask ${mask}`);
    if (hasReachableCycle) assertWitness(result);
  }
});

test('overlapping matching workflows each start once for every incoming delivery', () => {
  const result = analyze(blueprint([
    workflow('one', 'a', 'b'), workflow('two', 'a', 'b'),
    workflow('three', 'b', 'c', { emit: [] }), workflow('four', 'b', 'c', { emit: [] }),
  ]));
  assert.equal(result.stats.workflowStarts, '6');
  assert.equal(result.stats.emittedEvents, '2');
});
