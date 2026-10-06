import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBlueprint, validateBlueprint } from '../src/model.js';
import type { Blueprint } from '../src/types.js';

function minimal(): Blueprint {
  return { version: 1, name: 'Minimal', seed: { resource: 'crm:contacts', event: 'updated', data: {} }, workflows: [] };
}

function withWorkflow(): Blueprint {
  return { ...minimal(), workflows: [{ id: 'sync', name: 'Sync', on: { resource: 'crm:contacts', event: 'updated' }, emit: [] }] };
}

test('valid minimal and populated blueprints round-trip without mutation', () => {
  const input = withWorkflow();
  input.seed.data = { a: null, b: true, c: 0, d: '' };
  const workflow = input.workflows[0]!;
  workflow.enabled = true;
  workflow.when = [{ field: 'a', op: 'exists' }, { field: 'c', op: 'equals', value: 0 }];
  workflow.emit = [{ resource: 'sheet:leads', event: 'created', unset: ['a'], set: { e: 'copied' } }];
  const saved = structuredClone(input);
  assert.deepEqual(validateBlueprint(input), saved);
  assert.deepEqual(parseBlueprint(JSON.stringify(input)), saved);
  assert.deepEqual(input, saved);
});

test('malformed JSON and non-object roots fail at the boundary', () => {
  for (const text of ['', '{', 'null', '[]', 'false', '42', '"hello"']) assert.throws(() => parseBlueprint(text));
});

test('unsupported versions and unknown root fields cannot silently downgrade semantics', () => {
  for (const version of [0, 2, '1', null]) assert.throws(() => validateBlueprint({ ...minimal(), version }));
  assert.throws(() => validateBlueprint({ ...minimal(), concurrency: 4 }));
  assert.throws(() => validateBlueprint({ ...minimal(), expression: 'danger()' }));
});

test('required properties, labels and identifiers cannot be omitted or empty', () => {
  for (const key of ['name', 'seed', 'workflows', 'version']) {
    const input: Record<string, unknown> = { ...minimal() };
    delete input[key];
    assert.throws(() => validateBlueprint(input));
  }
  assert.throws(() => validateBlueprint({ ...minimal(), name: '' }));
  assert.throws(() => validateBlueprint({ ...minimal(), seed: { resource: '', event: 'updated', data: {} } }));
  assert.throws(() => validateBlueprint({ ...minimal(), seed: { resource: 'crm', event: '', data: {} } }));
});

test('nested structures reject arrays, missing fields and unsupported properties', () => {
  const invalid: unknown[] = [
    { ...minimal(), seed: [] },
    { ...minimal(), seed: { resource: 'crm', event: 'updated' } },
    { ...minimal(), seed: { resource: 'crm', event: 'updated', data: {}, headers: {} } },
    { ...minimal(), workflows: {} },
    { ...minimal(), workflows: [null] },
    { ...minimal(), workflows: [{ id: 'a', name: 'A', on: { resource: 'crm', event: 'updated' }, emit: [], retry: 3 }] },
    { ...minimal(), workflows: [{ id: 'a', name: 'A', on: { resource: 'crm', event: 'updated', expression: 'true' }, emit: [] }] },
    { ...minimal(), workflows: [{ id: 'a', name: 'A', on: { resource: 'crm', event: 'updated' }, emit: [{ resource: 'b', event: 'updated', delay: 5 }] }] },
  ];
  for (const input of invalid) assert.throws(() => validateBlueprint(input));
});

test('workflow IDs must be unique and enabled is a boolean', () => {
  const input = withWorkflow();
  assert.throws(() => validateBlueprint({ ...input, workflows: [input.workflows[0], input.workflows[0]] }));
  assert.throws(() => validateBlueprint({ ...input, workflows: [{ ...input.workflows[0], enabled: 'false' }] }));
});

test('conditions reject unknown operators, expressions and invalid operator-specific properties', () => {
  const conditions: unknown[] = [
    { field: 'x', op: 'contains', value: 'a' },
    { field: 'x', op: 'equals' },
    { field: 'x', op: 'exists', value: true },
    { field: 'x', op: 'missing', value: null },
    { field: 'x', op: 'equals', value: 'a', expression: 'true' },
    { field: '', op: 'exists' },
    { field: 'x', op: 'equals', value: {} },
  ];
  for (const condition of conditions) {
    const input = withWorkflow();
    assert.throws(() => validateBlueprint({ ...input, workflows: [{ ...input.workflows[0], when: [condition] }] }));
  }
});

test('scalar fields reject arrays, nested data, fractional and unsafe numeric values', () => {
  for (const value of [[], {}, undefined, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateBlueprint({ ...minimal(), seed: { ...minimal().seed, data: { value } } }));
  }
  for (const data of [null, [], 'not an object']) {
    assert.throws(() => validateBlueprint({ ...minimal(), seed: { ...minimal().seed, data } }));
  }
  assert.doesNotThrow(() => validateBlueprint({ ...minimal(), seed: { ...minimal().seed, data: { max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER } } }));
});

test('scalar strings accept 256 characters and reject 257 in every scalar position', () => {
  const input = withWorkflow();
  const good = 'a'.repeat(256);
  const bad = good + 'a';
  input.seed.data = { value: good };
  assert.doesNotThrow(() => validateBlueprint(input));
  input.seed.data.value = bad;
  assert.throws(() => validateBlueprint(input));
  input.seed.data = {};
  input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', set: { value: bad } }];
  assert.throws(() => validateBlueprint(input));
  input.workflows[0]!.emit = [];
  input.workflows[0]!.when = [{ field: 'value', op: 'equals', value: bad }];
  assert.throws(() => validateBlueprint(input));
});

test('input text has a hard 200,000-character limit', () => {
  const json = JSON.stringify(minimal());
  assert.doesNotThrow(() => parseBlueprint(json.padEnd(200_000, ' ')));
  assert.throws(() => parseBlueprint(json.padEnd(200_001, ' ')));
});

test('at most 100 workflows, 16 effects and 16 conditions are accepted', () => {
  const template = withWorkflow().workflows[0]!;
  const workflows = Array.from({ length: 100 }, (_, index) => ({ ...template, id: `w${index}` }));
  assert.doesNotThrow(() => validateBlueprint({ ...minimal(), workflows }));
  assert.throws(() => validateBlueprint({ ...minimal(), workflows: [...workflows, { ...template, id: 'extra' }] }));
  const input = withWorkflow();
  input.workflows[0]!.emit = Array.from({ length: 16 }, () => ({ resource: 'b', event: 'updated' }));
  input.workflows[0]!.when = Array.from({ length: 16 }, () => ({ field: 'x', op: 'exists' }));
  assert.doesNotThrow(() => validateBlueprint(input));
  input.workflows[0]!.emit.push({ resource: 'b', event: 'updated' });
  assert.throws(() => validateBlueprint(input));
  input.workflows[0]!.emit.pop();
  input.workflows[0]!.when.push({ field: 'x', op: 'exists' });
  assert.throws(() => validateBlueprint(input));
});

test('32 field names are a global union across seed, conditions, set and unset', () => {
  const input = withWorkflow();
  input.seed.data = Object.fromEntries(Array.from({ length: 29 }, (_, index) => [`f${index}`, index]));
  input.workflows[0]!.when = [{ field: 'condition-only', op: 'missing' }];
  input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', set: { 'set-only': true }, unset: ['unset-only'] }];
  assert.doesNotThrow(() => validateBlueprint(input));
  input.workflows[0]!.emit[0]!.unset!.push('one-too-many');
  assert.throws(() => validateBlueprint(input));
});

test('repeated field names do not consume additional global slots', () => {
  const input = withWorkflow();
  input.seed.data = Object.fromEntries(Array.from({ length: 32 }, (_, index) => [`f${index}`, index]));
  input.workflows[0]!.when = [{ field: 'f0', op: 'exists' }];
  input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', set: { f0: null }, unset: ['f1'] }];
  assert.doesNotThrow(() => validateBlueprint(input));
});

test('effect set and unset shapes cannot introduce implicit expression semantics', () => {
  const input = withWorkflow();
  for (const effect of [
    { resource: 'b', event: 'updated', set: [] },
    { resource: 'b', event: 'updated', set: { x: { expression: '1+1' } } },
    { resource: 'b', event: 'updated', unset: 'x' },
    { resource: 'b', event: 'updated', unset: [null] },
  ]) assert.throws(() => validateBlueprint({ ...input, workflows: [{ ...input.workflows[0], emit: [effect] }] }));
});

test('prototype-related field names are rejected in every field position', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const input = withWorkflow();
    input.seed.data = JSON.parse(`{"${key}":"value"}`) as Record<string, string>;
    assert.throws(() => validateBlueprint(input));
    input.seed.data = {};
    input.workflows[0]!.when = [{ field: key, op: 'missing' }];
    assert.throws(() => validateBlueprint(input));
    input.workflows[0]!.when = [];
    input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', set: JSON.parse(`{"${key}":"value"}`) as Record<string, string> }];
    assert.throws(() => validateBlueprint(input));
    input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', unset: [key] }];
    assert.throws(() => validateBlueprint(input));
  }
  assert.equal(Object.hasOwn(Object.prototype, 'value'), false);
});

test('field names obey the documented flat-field syntax and length limit', () => {
  for (const key of ['', '1first', 'has space', 'x[y]', 'x/y', 'x\n', 'x'.repeat(65)]) {
    const input = minimal();
    input.seed.data = { [key]: true };
    assert.throws(() => validateBlueprint(input));
  }
  const input = minimal();
  input.seed.data = { 'x_.-0': true, ['x'.repeat(64)]: false };
  assert.doesNotThrow(() => validateBlueprint(input));
});

test('duplicate unset fields are rejected instead of silently normalized', () => {
  const input = withWorkflow();
  input.workflows[0]!.emit = [{ resource: 'b', event: 'updated', unset: ['x', 'x'] }];
  assert.throws(() => validateBlueprint(input));
});

test('non-plain root and data objects are not accepted as JSON blueprints', () => {
  assert.throws(() => validateBlueprint(Object.create(minimal()) as unknown));
  assert.throws(() => validateBlueprint(new Date()));
  const input = minimal();
  input.seed.data = Object.create({ inherited: true }) as Record<string, boolean>;
  assert.throws(() => validateBlueprint(input));
});
