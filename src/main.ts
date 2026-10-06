import { EXAMPLES } from './examples';
import { parseBlueprint } from './model';
import { htmlReport } from './report';
import { mountSyncBuilder } from './sync-builder-view';
import type { Analysis, Blueprint, Budget, Condition, Signal, State, Transition, Workflow } from './types';

declare const __WORKER_SOURCE__: string;

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Missing interface element: ${selector}`);
  return result;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
const editor = element<HTMLTextAreaElement>('#blueprint');
const results = element('#results');
const status = element('#status');
const errorBox = element('#error');
const emptyState = element('#empty-state');
const cancelButton = element<HTMLButtonElement>('#cancel');
const runButton = element<HTMLButtonElement>('#run');
const budgetSelect = element<HTMLSelectElement>('#budget');
const resetButton = element<HTMLButtonElement>('#reset');
const saveBlueprintButton = element<HTMLButtonElement>('#save-blueprint');
let baseline: Blueprint;
let current: Blueprint;
let baselineReport: Analysis | null = null;
let currentReport: Analysis | null = null;
let selectedExample: string | null = null;
let revision = 0;
let dirty = false;
let cancelWorker: (() => void) | null = null;

function budget(): Budget {
  if (budgetSelect.value === 'extended') return { maxStates: 512, maxTransitions: 8192 };
  if (budgetSelect.value === 'small') return { maxStates: 16, maxTransitions: 32 };
  return { maxStates: 256, maxTransitions: 2048 };
}
function clearResult(message: string): number {
  revision += 1;
  cancelWorker?.();
  cancelWorker = null;
  currentReport = null;
  results.hidden = true;
  emptyState.hidden = false;
  cancelButton.hidden = true;
  runButton.disabled = false;
  errorBox.hidden = true;
  status.textContent = message;
  return revision;
}
function fail(error: unknown): void {
  errorBox.textContent = error instanceof Error ? error.message : 'The rehearsal could not finish.';
  errorBox.hidden = false;
  status.textContent = 'Rehearsal did not finish. Review the message and try again.';
  results.hidden = true;
  emptyState.hidden = false;
  currentReport = null;
}
function analyzeInWorker(blueprint: Blueprint): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      reject(error);
      return;
    }
    URL.revokeObjectURL(url);
    let finished = false;
    const finish = (value: Analysis | Error): void => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      worker.terminate();
      if (cancelWorker === cancel) cancelWorker = null;
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    const cancel = (): void => finish(new DOMException('Rehearsal cancelled.', 'AbortError'));
    cancelWorker = cancel;
    const timer = window.setTimeout(() => finish(new Error('The rehearsal exceeded 30 seconds. Try a smaller design or exploration budget.')), 30_000);
    worker.onmessage = (event: MessageEvent<{ report?: Analysis; error?: string }>): void => {
      if (event.data?.report?.schema === 'triggertangle.report/v1') finish(event.data.report);
      else finish(new Error(event.data?.error ?? 'The rehearsal returned an invalid response.'));
    };
    worker.onerror = (event): void => { event.preventDefault(); finish(new Error('The rehearsal worker stopped unexpectedly. Try again.')); };
    worker.onmessageerror = (): void => finish(new Error('The rehearsal response could not be read.'));
    try { worker.postMessage({ blueprint, budget: budget() }); }
    catch (error) { finish(error instanceof Error ? error : new Error('The design could not be sent to the rehearsal worker.')); }
  });
}
function updateControls(): void {
  resetButton.disabled = !dirty && JSON.stringify(current) === JSON.stringify(baseline);
  saveBlueprintButton.disabled = dirty;
  for (const toggle of document.querySelectorAll<HTMLInputElement>('.switch input')) toggle.disabled = dirty;
}
async function run(): Promise<void> {
  if (dirty) { applyEditor(); return; }
  const token = clearResult('Exploring the declared rules…');
  emptyState.hidden = true;
  cancelButton.hidden = false;
  runButton.disabled = true;
  try {
    if (!baselineReport) {
      const report = await analyzeInWorker(baseline);
      if (token !== revision) return;
      baselineReport = report;
    }
    const report = JSON.stringify(current) === JSON.stringify(baseline)
      ? baselineReport
      : await analyzeInWorker(current);
    if (token !== revision) return;
    currentReport = report;
    renderResult(report);
    status.textContent = report.complete
      ? 'Rehearsal complete. Results apply to this seed and these declared rules.'
      : 'Exploration incomplete. Read the limits before drawing a conclusion.';
  } catch (error) {
    if (token !== revision || (error instanceof DOMException && error.name === 'AbortError')) return;
    fail(error);
  } finally {
    if (token === revision) { cancelButton.hidden = true; runButton.disabled = false; }
  }
}
function loadBlueprint(blueprint: Blueprint, description: string, exampleId: string | null): void {
  clearResult('Preparing this design…');
  baseline = structuredClone(blueprint);
  current = structuredClone(blueprint);
  baselineReport = null;
  selectedExample = exampleId;
  dirty = false;
  editor.value = JSON.stringify(current, null, 2);
  element('#scenario-description').textContent = description;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.example-button')) {
    button.setAttribute('aria-pressed', String(button.dataset.example === selectedExample));
  }
  renderDesign();
  void run();
}
function applyEditor(): void {
  clearResult('Checking the blueprint…');
  try {
    const blueprint = parseBlueprint(editor.value);
    loadBlueprint(blueprint, `Your blueprint: ${blueprint.name}`, null);
  } catch (error) { fail(error); }
}
function scalar(value: unknown): string {
  return JSON.stringify(value) ?? 'missing';
}
function short(text: string, limit = 80): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
function appendSignal(target: HTMLElement, signal: Signal, id?: number): void {
  if (id !== undefined) target.append(node('span', 'state-id', `SIGNAL #${id}`));
  target.append(node('p', 'signal-resource', signal.resource), node('span', 'signal-event', signal.event));
  const fields = Object.entries(signal.data);
  if (fields.length) {
    const list = node('div', 'field-list');
    for (const [key, value] of fields.slice(0, 4)) {
      const content = `${key}: ${scalar(value)}`;
      const chip = node('span', 'field-chip', short(content));
      chip.title = content;
      list.append(chip);
    }
    if (fields.length > 4) list.append(node('span', 'field-chip', `+${fields.length - 4} fields`));
    target.append(list);
  }
}
function conditionText(condition: Condition): string {
  if (condition.op === 'exists') return `${condition.field} exists`;
  if (condition.op === 'missing') return `${condition.field} is missing`;
  return 'value' in condition ? `${condition.field} ${condition.op === 'equals' ? '=' : '≠'} ${scalar(condition.value)}` : condition.field;
}
function workflowRow(label: string, description: string): HTMLElement {
  const result = node('p', 'workflow-row');
  result.append(node('strong', '', label), document.createTextNode(description));
  return result;
}
function renderWorkflow(workflow: Workflow, index: number): HTMLElement {
  const enabled = workflow.enabled !== false;
  const card = node('article', `workflow-card${enabled ? '' : ' is-disabled'}`);
  const heading = node('div', 'workflow-card-header');
  const title = node('div');
  title.append(node('p', 'workflow-index', `WORKFLOW ${String(index + 1).padStart(2, '0')}`), node('h3', '', workflow.name));
  const label = node('label', 'switch');
  const toggle = node('input');
  toggle.type = 'checkbox';
  toggle.role = 'switch';
  toggle.checked = enabled;
  toggle.setAttribute('aria-label', `Enable ${workflow.name}`);
  toggle.addEventListener('change', () => {
    const changed = current.workflows[index];
    if (!changed) return;
    changed.enabled = toggle.checked;
    editor.value = JSON.stringify(current, null, 2);
    card.classList.toggle('is-disabled', !toggle.checked);
    const note = card.querySelector<HTMLElement>('.workflow-disabled');
    if (note) note.hidden = toggle.checked;
    updateControls();
    void run();
  });
  label.append(toggle);
  heading.append(title, label);
  card.append(heading, workflowRow('When', `${workflow.on.resource} · ${workflow.on.event}`));
  if (workflow.when?.length) {
    const conditions = node('ul', 'conditions');
    for (const condition of workflow.when) conditions.append(node('li', '', conditionText(condition)));
    card.append(conditions);
  }
  for (const effect of workflow.emit) {
    card.append(workflowRow('Emit', `${effect.resource} · ${effect.event}`));
    const changes: string[] = [];
    for (const [key, value] of Object.entries(effect.set ?? {})) changes.push(`${key} → ${scalar(value)}`);
    for (const key of effect.unset ?? []) changes.push(`remove ${key}`);
    if (changes.length) card.append(node('p', 'help', short(changes.join('; '), 180)));
  }
  if (!workflow.emit.length) card.append(workflowRow('Then', 'No event emitted'));
  const disabledNote = node('p', 'workflow-disabled', 'OFF · excluded from this rehearsal');
  disabledNote.hidden = enabled;
  card.append(disabledNote);
  return card;
}
function renderDesign(): void {
  const seed = element('#seed');
  seed.replaceChildren();
  appendSignal(seed, current.seed);
  element('#workflow-count').textContent = String(current.workflows.length).padStart(2, '0');
  element('#workflow-list').replaceChildren(...current.workflows.map(renderWorkflow));
  updateControls();
}
function statusLabel(report: Analysis | null): string {
  if (!report) return 'Not rehearsed';
  if (report.status === 'loop-found') return 'Loop found';
  return report.status === 'settles' ? 'Settles for this seed' : 'Inconclusive';
}
function comparisonDetail(report: Analysis | null): string {
  if (!report) return 'Run the original design first.';
  if (report.stats.workflowStarts !== null) return `${report.stats.workflowStarts} modeled workflow starts`;
  return report.complete ? 'Under the declared rules' : 'Exploration incomplete';
}
function traceSignal(state: State | undefined): HTMLElement {
  const result = node('div', 'trace-signal');
  if (state) appendSignal(result, state, state.id);
  else result.append(node('p', '', 'Signal unavailable'));
  return result;
}
function traceGroup(label: string, transitions: Transition[], states: Map<number, State>, cycle: boolean): HTMLElement {
  const group = node('div', `trace-group${cycle ? ' cycle' : ''}`);
  group.append(node('p', 'trace-group-label', label));
  const list = node('ol', 'trace-list');
  for (const transition of transitions.slice(0, 64)) {
    const item = node('li', 'trace-step');
    const workflow = current.workflows.find(candidate => candidate.id === transition.workflow);
    const cause = node('div', 'trace-workflow');
    cause.append(node('span', '', workflow?.name ?? transition.workflow));
    const arrow = node('span', '', '→');
    arrow.setAttribute('aria-hidden', 'true');
    cause.append(arrow);
    item.append(traceSignal(states.get(transition.from)), cause, traceSignal(states.get(transition.to)));
    list.append(item);
  }
  group.append(list);
  if (transitions.length > 64) group.append(node('p', 'help trace-overflow', `Showing the first 64 of ${transitions.length} causal links. Save JSON for the complete witness.`));
  return group;
}
function renderTrace(report: Analysis): void {
  const trace = element('#trace');
  trace.replaceChildren();
  const states = new Map(report.states.map(state => [state.id, state]));
  if (report.witness) {
    element('#trace-title').textContent = 'A chain that comes back around';
    element('#trace-tag').textContent = `${report.witness.cycle.length} links in the cycle`;
    element('#trace-description').textContent = 'Each arrow is an emitted event. The repeated signal can start the same chain again under these rules.';
    if (report.witness.leadIn.length) trace.append(traceGroup('How the chain is reached', report.witness.leadIn, states, false));
    trace.append(traceGroup('The repeating part', report.witness.cycle, states, true));
    const first = report.witness.cycle[0];
    if (first) trace.append(node('p', 'cycle-return', `↩ Signal #${first.from} returns with the same fields. This causal cycle can repeat in the model.`));
  } else {
    element('#trace-title').textContent = 'Signals reached in this rehearsal';
    element('#trace-tag').textContent = report.complete ? 'NO REACHABLE CYCLE' : 'PARTIAL EXPLORATION';
    element('#trace-description').textContent = report.complete
      ? 'These are unique signal states, not delivery counts. Shared downstream signals can be reached more than once.'
      : 'Only the explored part is shown. Unexplored work may still contain a cycle.';
    const list = node('div', 'signal-grid');
    for (const state of report.states.slice(0, 24)) {
      const card = traceSignal(state);
      card.append(node('p', 'signal-end', state.matches.length ? `${state.matches.length} observed matching workflow${state.matches.length === 1 ? '' : 's'}` : report.complete ? 'No matching workflow' : 'Matches not established in this partial graph'));
      list.append(card);
    }
    trace.append(list);
    if (report.states.length > 24) trace.append(node('p', 'help trace-overflow', `Showing 24 of ${report.states.length} unique signals. Save JSON for the complete explored graph.`));
  }
}
function renderResult(report: Analysis): void {
  results.hidden = false;
  emptyState.hidden = true;
  element('#verdict').className = `verdict ${report.status}`;
  element('#verdict-label').textContent = report.status === 'loop-found' ? 'REPEATING CAUSAL CHAIN FOUND' : report.status === 'settles' ? 'THIS SEED REACHES A STOP' : 'MORE EXPLORATION NEEDED';
  element('#result-title').textContent = report.status === 'loop-found' ? 'These rules can keep each other running.' : report.status === 'settles' ? 'This design settles for this seed.' : 'The result is still open.';
  element('#result-reason').textContent = report.reason;
  element('#completeness').textContent = report.complete
    ? 'Complete exploration within this model · not a guarantee about a live platform'
    : 'Incomplete exploration · the budget was reached before all work was explored';
  element('#baseline-result').textContent = statusLabel(baselineReport);
  element('#current-result').textContent = statusLabel(report);
  element('#baseline-count').textContent = comparisonDetail(baselineReport);
  element('#current-count').textContent = comparisonDetail(report);
  element('#states-count').textContent = String(report.stats.states);
  element('#transitions-count').textContent = String(report.stats.transitions);
  element('#starts-count').textContent = report.stats.workflowStarts ?? '—';
  element('#starts-count').title = report.stats.workflowStarts === null ? 'Unavailable for loops or incomplete exploration.' : 'Counts event deliveries, including repeated paths to a shared signal.';
  element('#notes').replaceChildren(...report.notes.map(note => node('li', '', note)));
  renderTrace(report);
}
function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = node('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
editor.addEventListener('input', () => {
  dirty = true;
  clearResult('Blueprint edited. Apply it to rehearse the new rules.');
  updateControls();
});
element('#apply').addEventListener('click', applyEditor);
runButton.addEventListener('click', () => { void run(); });
cancelButton.addEventListener('click', () => clearResult('Rehearsal cancelled. Run it again when you are ready.'));
resetButton.addEventListener('click', () => {
  current = structuredClone(baseline);
  dirty = false;
  editor.value = JSON.stringify(current, null, 2);
  renderDesign();
  void run();
});
budgetSelect.addEventListener('change', () => {
  baselineReport = null;
  clearResult('Exploration budget changed. Run the rehearsal again.');
});
element<HTMLInputElement>('#import').addEventListener('change', async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const token = clearResult('Reading the selected blueprint…');
  try {
    if (file.size > 800_000) throw new Error('The JSON file exceeds the 800 KB import limit.');
    const bytes = await file.arrayBuffer();
    if (token !== revision) return;
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Import must be valid UTF-8 JSON. The file contains invalid text encoding.'); }
    const blueprint = parseBlueprint(text);
    loadBlueprint(blueprint, `Imported blueprint: ${blueprint.name}`, null);
  } catch (error) { if (token === revision) fail(error); }
  finally { input.value = ''; }
});
saveBlueprintButton.addEventListener('click', () => {
  if (!dirty) download('triggertangle-blueprint.json', `${JSON.stringify(current, null, 2)}\n`, 'application/json');
});
element('#save-json').addEventListener('click', () => {
  if (currentReport) download('triggertangle-report.json', `${JSON.stringify(currentReport, null, 2)}\n`, 'application/json');
});
element('#save-html').addEventListener('click', () => {
  if (currentReport) download('triggertangle-report.html', htmlReport(currentReport), 'text/html');
});
for (const [index, example] of EXAMPLES.entries()) {
  const button = node('button', 'example-button');
  button.type = 'button';
  button.dataset.example = example.id;
  button.setAttribute('aria-pressed', 'false');
  button.append(node('span', 'example-number', String(index + 1).padStart(2, '0')), node('span', '', example.name));
  button.addEventListener('click', () => loadBlueprint(example.blueprint, example.description, example.id));
  element('#examples').append(button);
}
mountSyncBuilder(element('#sync-builder'), blueprint => {
  loadBlueprint(blueprint, 'Your two-way sync: explicit rules for the two resources you named.', null);
});
const first = EXAMPLES[0];
if (first) loadBlueprint(first.blueprint, first.description, first.id);
else fail(new Error('No example blueprints are available.'));
