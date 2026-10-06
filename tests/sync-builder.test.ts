import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze } from '../src/engine';
import { validateBlueprint } from '../src/model';
import { buildSyncBlueprint, type SyncDraft } from '../src/sync-builder';

function draft(options: Partial<SyncDraft> = {}): SyncDraft {
  return { firstResource: 'crm/contacts', secondResource: 'sheet/contacts', event: 'updated', guarded: false, ...options };
}

test('an unguarded two-way sync produces a two-edge cycle using the supplied names and event', () => {
  const blueprint = buildSyncBlueprint(draft({ firstResource: 'sales/accounts', secondResource: 'billing/accounts', event: 'changed' }));
  assert.equal(validateBlueprint(blueprint), blueprint);
  const result = analyze(blueprint);
  assert.equal(result.status, 'loop-found');
  assert.equal(result.witness?.cycle.length, 2);
  assert.deepEqual(result.states.map(state => [state.resource, state.event]), [['sales/accounts', 'changed'], ['billing/accounts', 'changed']]);
});

test('the origin guard stops propagation after one hop from either resource', () => {
  const blueprint = buildSyncBlueprint(draft({ guarded: true }));
  for (const workflow of blueprint.workflows) {
    assert.deepEqual(workflow.when, [{ field: 'origin', op: 'notEquals', value: 'triggertangle-sync' }]);
    assert.deepEqual(workflow.emit[0]?.set, { origin: 'triggertangle-sync' });
    blueprint.seed.resource = workflow.on.resource;
    const result = analyze(blueprint);
    assert.equal(result.status, 'settles');
    assert.equal(result.stats.workflowStarts, '1');
    assert.equal(result.stats.emittedEvents, '1');
    assert.equal(result.states[1]?.data.origin, 'triggertangle-sync');
  }
});

test('marked events are skipped while events with another origin still propagate once', () => {
  const blueprint = buildSyncBlueprint(draft({ guarded: true }));
  for (const resource of ['crm/contacts', 'sheet/contacts']) {
    blueprint.seed = { ...blueprint.seed, resource, data: { origin: 'triggertangle-sync' } };
    assert.equal(analyze(blueprint).stats.workflowStarts, '0');
    blueprint.seed.data.origin = 'another-workflow';
    assert.equal(analyze(blueprint).stats.workflowStarts, '1');
  }
});

test('resource IDs are trimmed but retain exact case-sensitive identity', () => {
  const blueprint = buildSyncBlueprint(draft({ firstResource: ' contacts ', secondResource: 'Contacts', event: ' changed ' }));
  assert.equal(blueprint.seed.resource, 'contacts');
  assert.equal(blueprint.seed.event, 'changed');
  assert.equal(blueprint.workflows[1]?.on.resource, 'Contacts');
  assert.throws(() => buildSyncBlueprint(draft({ firstResource: ' contacts ', secondResource: 'contacts' })), /two different resource IDs/);
});

test('empty, oversized and control-character labels are rejected without changing a draft', () => {
  for (const property of ['firstResource', 'secondResource', 'event'] as const) {
    for (const value of ['', '   ', 'x'.repeat(121), 'line\nbreak', 'name\u007f', '\tname']) {
      const input = draft({ [property]: value });
      const snapshot = structuredClone(input);
      assert.throws(() => buildSyncBlueprint(input), /1–120 characters/);
      assert.deepEqual(input, snapshot);
    }
  }
  assert.throws(() => buildSyncBlueprint(draft({ guarded: 'yes' as unknown as boolean })), /on or off/);
});

test('maximum-length and markup-like resource IDs stay literal and validate', () => {
  const blueprint = buildSyncBlueprint(draft({ firstResource: 'a'.repeat(120), secondResource: 'b'.repeat(120), event: 'e'.repeat(120) }));
  assert.equal(analyze(blueprint).status, 'loop-found');
  const markup = '<img src=x onerror=alert(1)>${process.exit(1)}';
  assert.equal(buildSyncBlueprint(draft({ firstResource: markup })).seed.resource, markup);
});
