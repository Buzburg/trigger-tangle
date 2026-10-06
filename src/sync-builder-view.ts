import { buildSyncBlueprint } from './sync-builder';
import type { Blueprint } from './types';

function text<K extends keyof HTMLElementTagNameMap>(tag: K, content: string, className = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.textContent = content;
  element.className = className;
  return element;
}

export function mountSyncBuilder(container: HTMLElement, onBuild: (blueprint: Blueprint) => void): void {
  const form = document.createElement('form');
  form.id = 'sync-builder-form';
  form.noValidate = true;
  const intro = text('p', 'Name two resources that copy changes to each other. This creates an explicit model of your rules; it does not scan or connect to your apps.', 'sync-builder-intro help');
  const fields = document.createElement('div');
  fields.className = 'sync-builder-fields';
  function field(id: string, labelText: string, placeholder: string, value = ''): HTMLInputElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'sync-builder-field';
    const label = text('label', labelText);
    label.htmlFor = id;
    const input = document.createElement('input');
    input.id = id;
    input.name = id;
    input.type = 'text';
    input.required = true;
    input.maxLength = 120;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = placeholder;
    input.value = value;
    wrapper.append(label, input);
    fields.append(wrapper);
    return input;
  }
  const first = field('sync-first-resource', 'First system / resource', 'crm/contacts');
  const second = field('sync-second-resource', 'Second system / resource', 'sheet/contacts');
  const event = field('sync-event', 'Event name', 'updated', 'updated');
  const resourceHint = text('p', 'Use distinct resource IDs. Matching is exact and case-sensitive. The first signal starts in the first resource.', 'sync-builder-hint help');
  resourceHint.id = 'sync-resource-help';
  first.setAttribute('aria-describedby', resourceHint.id);
  second.setAttribute('aria-describedby', resourceHint.id);
  const guardLabel = document.createElement('label');
  guardLabel.className = 'sync-builder-guard';
  const guard = document.createElement('input');
  guard.type = 'checkbox';
  guard.id = 'sync-origin-guard';
  guard.name = guard.id;
  guard.setAttribute('aria-describedby', 'sync-guard-help');
  guardLabel.append(guard, text('span', 'Stop marked changes from returning'));
  const guardHint = text('p', 'Both directions add the same origin marker and skip marked events. In this model, that stops propagation after one hop. Real systems must preserve the marker and enforce both rules; this does not guarantee a live sync is safe.', 'sync-builder-hint help');
  guardHint.id = 'sync-guard-help';
  const draftHint = text('p', 'Draft changes take effect only when you build. Building replaces the current design and starts a fresh rehearsal.', 'sync-builder-hint help');
  const error = text('p', '', 'error-box');
  error.id = 'sync-builder-error';
  error.setAttribute('role', 'alert');
  error.tabIndex = -1;
  error.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'sync-builder-actions';
  const submit = text('button', 'Build my rehearsal', 'primary');
  submit.type = 'submit';
  actions.append(submit);
  form.append(intro, fields, resourceHint, guardLabel, guardHint, draftHint, error, actions);
  form.addEventListener('submit', (submission) => {
    submission.preventDefault();
    let blueprint: Blueprint;
    try {
      blueprint = buildSyncBlueprint({ firstResource: first.value, secondResource: second.value, event: event.value, guarded: guard.checked });
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : 'Check the fields and try again.';
      error.hidden = false;
      error.focus();
      return;
    }
    error.hidden = true;
    onBuild(blueprint);
  });
  container.replaceChildren(form);
}
