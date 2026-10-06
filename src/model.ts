import type { Blueprint, Fields, Scalar } from './types';

export const MAX_TEXT = 200_000;
function record(value: unknown, at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${at} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], required: string[], at: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${at}: unsupported property ${JSON.stringify(key)}.`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${at}.${key} is required.`);
}
function text(value: unknown, at: string, max = 120): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${at} must be nonempty text, at most ${max} characters, without control characters.`);
}
function scalar(value: unknown, at: string): asserts value is Scalar {
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value)) || (typeof value === 'string' && value.length <= 256)) return;
  throw new Error(`${at} must be a string (up to 256 characters), safe integer, boolean or null.`);
}
function list(value: unknown, max: number, at: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${at} must be an array with at most ${max} items.`);
  return value;
}
function field(value: unknown, at: string, fields: Set<string>): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error(`${at} is not a supported field name.`);
  fields.add(value);
  if (fields.size > 32) throw new Error('A blueprint may use at most 32 distinct data fields.');
}
function data(value: unknown, at: string, fields: Set<string>): asserts value is Fields {
  const object = record(value, at);
  for (const [key, item] of Object.entries(object)) { field(key, at, fields); scalar(item, `${at}.${key}`); }
}
function address(value: Record<string, unknown>, at: string): void {
  text(value.resource, `${at}.resource`); text(value.event, `${at}.event`);
}

export function parseBlueprint(text: string): Blueprint {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw new Error('Blueprint text exceeds 200,000 characters.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Blueprint is not valid JSON. Check commas, quotes and brackets.'); }
  return validateBlueprint(value);
}

export function validateBlueprint(value: unknown): Blueprint {
  const root = record(value, 'Blueprint');
  keys(root, ['version', 'name', 'seed', 'workflows'], ['version', 'name', 'seed', 'workflows'], 'Blueprint');
  if (root.version !== 1) throw new Error('Only blueprint version 1 is supported.');
  text(root.name, 'Blueprint.name', 200);
  const fields = new Set<string>();
  const seed = record(root.seed, 'seed'); keys(seed, ['resource', 'event', 'data'], ['resource', 'event', 'data'], 'seed');
  address(seed, 'seed'); data(seed.data, 'seed.data', fields);
  const ids = new Set<string>();
  for (const [index, item] of list(root.workflows, 100, 'workflows').entries()) {
    const at = `workflows[${index}]`; const workflow = record(item, at);
    keys(workflow, ['id', 'name', 'enabled', 'on', 'when', 'emit'], ['id', 'name', 'on', 'emit'], at);
    text(workflow.id, `${at}.id`, 64); text(workflow.name, `${at}.name`, 200);
    if (ids.has(workflow.id)) throw new Error(`Duplicate workflow ID: ${JSON.stringify(workflow.id)}.`);
    ids.add(workflow.id);
    if (Object.hasOwn(workflow, 'enabled') && typeof workflow.enabled !== 'boolean') throw new Error(`${at}.enabled must be a boolean.`);
    const on = record(workflow.on, `${at}.on`); keys(on, ['resource', 'event'], ['resource', 'event'], `${at}.on`); address(on, `${at}.on`);
    if (Object.hasOwn(workflow, 'when')) for (const [conditionIndex, item] of list(workflow.when, 16, `${at}.when`).entries()) {
      const location = `${at}.when[${conditionIndex}]`; const condition = record(item, location);
      if (condition.op === 'equals' || condition.op === 'notEquals') {
        keys(condition, ['field', 'op', 'value'], ['field', 'op', 'value'], location); scalar(condition.value, `${location}.value`);
      } else if (condition.op === 'exists' || condition.op === 'missing') {
        keys(condition, ['field', 'op'], ['field', 'op'], location);
      } else throw new Error(`${location}.op must be equals, notEquals, exists or missing.`);
      field(condition.field, `${location}.field`, fields);
    }
    for (const [effectIndex, item] of list(workflow.emit, 16, `${at}.emit`).entries()) {
      const location = `${at}.emit[${effectIndex}]`; const effect = record(item, location);
      keys(effect, ['resource', 'event', 'set', 'unset'], ['resource', 'event'], location); address(effect, location);
      if (Object.hasOwn(effect, 'set')) data(effect.set, `${location}.set`, fields);
      if (Object.hasOwn(effect, 'unset')) {
        const unset = list(effect.unset, 32, `${location}.unset`); const seen = new Set<string>();
        for (const key of unset) { field(key, `${location}.unset`, fields); if (seen.has(key)) throw new Error(`${location}.unset repeats a field.`); seen.add(key); }
      }
    }
  }
  return value as Blueprint;
}
