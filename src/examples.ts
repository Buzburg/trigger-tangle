import type { Blueprint } from './types';

const contact: Blueprint = {
  version: 1, name: 'Two-way contact sync',
  seed: { resource: 'crm/contacts', event: 'updated', data: { contact: 'sample-42', origin: 'human' } },
  workflows: [
    { id: 'crm-to-sheet', name: 'Copy CRM changes to the sheet', on: { resource: 'crm/contacts', event: 'updated' }, emit: [{ resource: 'sheets/contacts', event: 'updated' }] },
    { id: 'sheet-to-crm', name: 'Copy sheet changes to the CRM', on: { resource: 'sheets/contacts', event: 'updated' }, emit: [{ resource: 'crm/contacts', event: 'updated' }] },
  ],
};
const guarded: Blueprint = {
  ...structuredClone(contact), name: 'Contact sync with an origin marker',
  workflows: contact.workflows.map(workflow => ({ ...structuredClone(workflow), when: [{ field: 'origin', op: 'notEquals', value: 'contact-sync' }], emit: workflow.emit.map(effect => ({ ...effect, set: { origin: 'contact-sync' } })) })),
};
export const EXAMPLES: Array<{ id: string; name: string; description: string; blueprint: Blueprint }> = [
  { id: 'contact-loop', name: 'Contact ping-pong', description: 'Two useful syncs keep waking each other up through shared records.', blueprint: contact },
  { id: 'guarded-sync', name: 'A marker breaks the loop', description: 'Model a field that marks your own writes, with matching filters on both workflows.', blueprint: guarded },
  { id: 'self-reply', name: 'The auto-reply trap', description: 'A reply is modeled as a new message in the same watched mailbox.', blueprint: { version: 1, name: 'Auto-reply trap', seed: { resource: 'mail/all-folders', event: 'message', data: { conversation: 'example-17' } }, workflows: [{ id: 'reply', name: 'Reply to each message', on: { resource: 'mail/all-folders', event: 'message' }, emit: [{ resource: 'mail/all-folders', event: 'message' }] }] } },
  { id: 'fan-out', name: 'An ordinary sales handoff', description: 'One won deal creates an invoice draft and an onboarding task; neither starts the original workflow.', blueprint: { version: 1, name: 'Sales handoff', seed: { resource: 'crm/deals', event: 'won', data: { deal: 'demo-8' } }, workflows: [
    { id: 'draft-invoice', name: 'Prepare an invoice draft', on: { resource: 'crm/deals', event: 'won' }, emit: [{ resource: 'billing/drafts', event: 'created' }] },
    { id: 'onboard', name: 'Create an onboarding task', on: { resource: 'crm/deals', event: 'won' }, emit: [{ resource: 'ops/tasks', event: 'created' }] },
    { id: 'review', name: 'Queue draft review', on: { resource: 'billing/drafts', event: 'created' }, emit: [{ resource: 'ops/reviews', event: 'requested' }] },
  ] } },
];
