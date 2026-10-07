import { analyze } from './engine';
import { EXAMPLES } from './examples';
import type { Analysis, Blueprint } from './types';

const DURATION = 20_000;
function example(id: string): Blueprint {
  const found = EXAMPLES.find(item => item.id === id);
  if (!found) throw new Error(`Missing walkthrough example: ${id}`);
  return structuredClone(found.blueprint);
}
function reaches(report: Analysis, resource: string): boolean {
  return report.complete && report.status === 'settles' && report.stats.workflowStarts === '1'
    && report.states.some(state => state.resource === resource && state.data.origin === 'contact-sync' && state.data.contact === 'sample-42');
}
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
const loop = analyze(example('contact-loop'));
const guardedForward = analyze(example('guarded-sync'));
const reverse = example('guarded-sync');
reverse.seed.resource = 'sheets/contacts';
const guardedReverse = analyze(reverse);
const outcomes = {
  crmToSheet: reaches(guardedForward, 'sheets/contacts'),
  sheetToCrm: reaches(guardedReverse, 'crm/contacts'),
};
const demoEvidence = deepFreeze({ loop, guardedForward, guardedReverse, outcomes });
declare global {
  interface Window {
    renderDemoAt: (milliseconds: number) => void;
    readonly demoEvidence: typeof demoEvidence;
  }
}
function element<T extends Element = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing walkthrough element: ${id}`);
  return node as unknown as T;
}
function text(id: string, value: string): void { element(id).textContent = value; }
function show(id: string, visible: boolean): void { element<HTMLElement>(id).hidden = !visible; }
function pulse(id: string, progress: number, backward = false): void {
  const node = element(id);
  const p = Math.max(0, Math.min(1, progress)), q = 1 - p;
  const x = backward ? q*q*q*755 + 3*q*q*p*645 + 3*q*p*p*475 + p*p*p*365
    : q*q*q*365 + 3*q*q*p*475 + 3*q*p*p*645 + p*p*p*755;
  const y = backward ? q*q*q*188 + 3*q*q*p*276 + 3*q*p*p*276 + p*p*p*188
    : q*q*q*123 + 3*q*q*p*35 + 3*q*p*p*35 + p*p*p*123;
  node.setAttribute('cx', x.toFixed(3)); node.setAttribute('cy', y.toFixed(3));
  node.setAttribute('visibility', progress >= 0 && progress <= 1 ? 'visible' : 'hidden');
}
const scenes = [
  { name: 'intro', step: '01 / THE CONNECTION', title: 'One change. One useful sync.', caption: 'A human edits the CRM. A workflow copies the change to a sheet.' },
  { name: 'loop', step: '02 / THE CHAIN REACTION', title: 'The copy triggers a copy back.', caption: 'The return update wakes the first workflow. The same signal repeats.' },
  { name: 'guard', step: '03 / THE MARKER GUARD', title: 'Mark your writes. Ignore the echo.', caption: 'Both workflows skip updates carrying their own origin marker.' },
  { name: 'verify', step: '04 / CHECK THE INTENDED WORK', title: 'The useful sync still happens.', caption: 'Test a human change in each direction. Both reach the other resource.' },
  { name: 'cta', step: '05 / REHEARSE YOUR DESIGN', title: 'Catch the chain reaction.', caption: 'Explore the model before connecting real accounts.' },
] as const;
let position = 0, playing = false, frame = 0, previousTime = 0;
const capture = new URLSearchParams(location.search).get('capture') === '1';
document.body.classList.toggle('capture', capture);
function render(milliseconds: number): void {
  position = typeof milliseconds === 'number' && !Number.isNaN(milliseconds) ? Math.max(0, Math.min(DURATION, milliseconds)) : 0;
  const index = position < 4000 ? 0 : position < 9000 ? 1 : position < 14000 ? 2 : position < 18000 ? 3 : 4;
  const scene = scenes[index]!;
  element('demo').setAttribute('data-scene', scene.name);
  text('scene-step', scene.step); text('scene-title', scene.title); text('scene-caption', scene.caption);
  text('diagram-description', scene.caption);
  show('diagram', index !== 4); show('outcome', index !== 4); show('cta', index === 4);
  element('guard-badge').setAttribute('visibility', index === 2 ? 'visible' : 'hidden');
  text('crm-source', index === 3 ? 'Human change · test 1' : index === 2 ? 'origin: human' : 'Human change');
  text('sheet-source', index === 3 ? 'Human change · test 2' : index === 2 ? 'origin: contact-sync' : 'Copied change');
  text('forward-label', index === 3 ? `CRM → sheet: ${outcomes.crmToSheet ? 'PASS' : 'NOT PROVEN'}` : 'CRM → sheet');
  text('back-label', index === 3 ? `Sheet → CRM: ${outcomes.sheetToCrm ? 'PASS' : 'NOT PROVEN'}` : index === 2 ? 'Return workflow filtered out' : 'Sheet → CRM');
  pulse('forward-pulse', -1); pulse('back-pulse', -1, true);
  if (index === 0) {
    pulse('forward-pulse', (position - 600) / 2200);
    text('outcome-label', 'THE DECLARED DESIGN');
    text('outcome-value', `${loop.blueprint.workflows.length} connected workflows`);
    text('outcome-note', 'Both listen for updates. Neither checks who made the change.');
  } else if (index === 1) {
    const progress = ((position - 4000) % 2200) / 1100;
    pulse('back-pulse', progress, true); pulse('forward-pulse', progress - 1);
    text('outcome-label', loop.status === 'loop-found' ? 'ANALYZER: LOOP FOUND' : 'ANALYZER: ' + loop.status.toUpperCase());
    text('outcome-value', `${loop.witness?.cycle.length ?? 0} transitions in the cycle`);
    text('outcome-note', 'A repeatable causal cycle under these declared rules. Not proof of a live platform failure.');
  } else if (index === 2) {
    pulse('forward-pulse', (position - 9200) / 1600);
    text('outcome-label', 'ANALYZER: ' + guardedForward.status.toUpperCase());
    text('outcome-value', `${guardedForward.stats.workflowStarts ?? 'Unknown'} workflow start · ${guardedForward.stats.emittedEvents ?? 'unknown'} emitted event`);
    text('outcome-note', 'The sheet receives the change. Its origin marker prevents the feedback trigger.');
  } else if (index === 3) {
    pulse('forward-pulse', (position - 14200) / 1400); pulse('back-pulse', (position - 16200) / 1400, true);
    text('outcome-label', 'TWO SEPARATE HUMAN-SEED TESTS');
    text('outcome-value', `${Number(outcomes.crmToSheet) + Number(outcomes.sheetToCrm)} / 2 declared outcomes reached`);
    text('outcome-note', `CRM seed: ${guardedForward.stats.workflowStarts ?? 'unknown'} start. Sheet seed: ${guardedReverse.stats.workflowStarts ?? 'unknown'} start. Both settle under this model.`);
  }
  element<HTMLElement>('timeline-fill').style.width = `${position / DURATION * 100}%`;
  element<HTMLInputElement>('seek').value = String(position);
  element('seek').setAttribute('aria-valuetext', `${Math.floor(position / 1000)} of 20 seconds`);
  text('time', `0:${String(Math.floor(position / 1000)).padStart(2, '0')} / 0:20`);
}
function pause(): void {
  playing = false; cancelAnimationFrame(frame); text('play-pause', 'Play walkthrough');
}
function tick(time: number): void {
  if (!playing) return;
  render(position + Math.max(0, time - previousTime)); previousTime = time;
  if (position === DURATION) { pause(); text('playback-status', 'Walkthrough complete. Replay or explore TriggerTangle.'); }
  else frame = requestAnimationFrame(tick);
}
function play(): void {
  if (position === DURATION) render(0);
  playing = true; previousTime = performance.now(); text('play-pause', 'Pause');
  text('playback-status', 'Playing the 20-second illustrated walkthrough.'); frame = requestAnimationFrame(tick);
}
window.renderDemoAt = milliseconds => { pause(); render(milliseconds); };
Object.defineProperty(window, 'demoEvidence', { value: demoEvidence, writable: false, configurable: false });
element('play-pause').addEventListener('click', () => { if (playing) { pause(); text('playback-status', 'Paused.'); } else play(); });
element('replay').addEventListener('click', () => { pause(); render(0); play(); });
element<HTMLInputElement>('seek').addEventListener('input', event => {
  pause(); render(Number((event.target as HTMLInputElement).value)); text('playback-status', `Paused at ${Math.floor(position / 1000)} seconds.`);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
render(0);
if (matchMedia('(prefers-reduced-motion: reduce)').matches) text('playback-status', 'Reduced motion: paused. Use the position control to inspect each scene.');
