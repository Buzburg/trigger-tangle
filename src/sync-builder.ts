import { validateBlueprint } from './model';
import type { Blueprint, Workflow } from './types';

export interface SyncDraft {
  firstResource: string;
  secondResource: string;
  event: string;
  guarded: boolean;
}

function resourceName(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be 1–120 characters, without control characters.`);
  }
  return value.trim();
}

export function buildSyncBlueprint(draft: SyncDraft): Blueprint {
  const first = resourceName(draft.firstResource, 'First system / resource');
  const second = resourceName(draft.secondResource, 'Second system / resource');
  const event = resourceName(draft.event, 'Event name');
  if (first === second) throw new Error('Use two different resource IDs. The first and second system currently have the same ID.');
  if (typeof draft.guarded !== 'boolean') throw new Error('The origin marker option must be on or off.');
  function direction(id: string, from: string, to: string): Workflow {
    return {
      id,
      name: `Copy changes to ${to}`,
      on: { resource: from, event },
      ...(draft.guarded ? { when: [{ field: 'origin', op: 'notEquals' as const, value: 'triggertangle-sync' }] } : {}),
      emit: [{ resource: to, event, ...(draft.guarded ? { set: { origin: 'triggertangle-sync' } } : {}) }],
    };
  }
  return validateBlueprint({
    version: 1,
    name: 'Your two-way sync',
    seed: { resource: first, event, data: {} },
    workflows: [direction('first-to-second', first, second), direction('second-to-first', second, first)],
  });
}
