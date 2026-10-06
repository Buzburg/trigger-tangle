import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze } from '../src/engine.js';
import { EXAMPLES } from '../src/examples.js';
import { escapeHtml, htmlReport } from '../src/report.js';
import type { Blueprint } from '../src/types.js';

function example(id: string): Blueprint {
  const value = EXAMPLES.find((item) => item.id === id);
  assert.ok(value);
  return structuredClone(value.blueprint);
}

test('HTML escaping covers all context-significant characters without treating entities as markup', () => {
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
  assert.equal(escapeHtml('Unicode: 日本 🎯'), 'Unicode: 日本 🎯');
});

test('HTML report keeps labels, field values and resource identifiers as text', () => {
  const payload = '</pre><script>alert(1)</script><img src=x onerror=alert(2)>';
  const blueprint: Blueprint = {
    version: 1, name: payload,
    seed: { resource: payload, event: '<b>event</b>', data: { sample: payload } },
    workflows: [{ id: '<svg onload=alert(3)>', name: payload, on: { resource: payload, event: '<b>event</b>' }, emit: [{ resource: payload, event: '<b>event</b>' }] }],
  };
  const html = htmlReport(analyze(blueprint));
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('<svg'), false);
  assert.equal(html.includes('<b>event'), false);
  assert.ok(html.includes(escapeHtml(payload)));
  assert.ok(html.includes(escapeHtml('<svg onload=alert(3)>')));
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
});

test('report serializes the exact analyzed blueprint snapshot even after later input edits', () => {
  const blueprint = example('contact-loop');
  const saved = structuredClone(blueprint);
  const report = analyze(blueprint);
  blueprint.name = 'Edited after analysis';
  blueprint.seed.data.origin = 'changed';
  blueprint.workflows[0]!.enabled = false;
  assert.deepEqual(report.blueprint, saved);
  const html = htmlReport(report);
  assert.ok(html.includes(escapeHtml(JSON.stringify(saved, null, 2))));
  assert.equal(html.includes('Edited after analysis'), false);
});

test('loop report carries witness steps, budgets and explicit model boundaries', () => {
  const html = htmlReport(analyze(example('contact-loop'), { maxStates: 30, maxTransitions: 60 }));
  assert.match(html, /Feedback loop found in the model/);
  assert.match(html, /Repeating chain/);
  assert.match(html, /crm-to-sheet/);
  assert.match(html, /sheet-to-crm/);
  assert.match(html, /Budget: 30 states \/ 60 edges/);
  assert.match(html, /Modeled workflow starts: unavailable/);
  assert.match(html, /not proof of runaway behavior/);
});

test('settling report contains modeled counts and does not claim production certification', () => {
  const html = htmlReport(analyze(example('fan-out')));
  assert.match(html, /This modeled handoff settles/);
  assert.match(html, /Modeled workflow starts: 3/);
  assert.match(html, /emitted event deliveries: 3/);
  assert.match(html, /not a production safety certification/);
  assert.equal(html.includes('<h2>Repeating chain</h2>'), false);
});

test('incomplete report makes unavailable counts and unresolved termination explicit', () => {
  const html = htmlReport(analyze(example('contact-loop'), { maxStates: 1 }));
  assert.match(html, /Incomplete rehearsal/);
  assert.match(html, /exploration incomplete/);
  assert.match(html, /Modeled workflow starts: unavailable/);
  assert.match(html, /incomplete search cannot rule out a loop/);
});

test('disabled workflows remain visible in the report instead of disappearing from the evidence', () => {
  const blueprint = example('contact-loop');
  blueprint.workflows[0]!.enabled = false;
  const html = htmlReport(analyze(blueprint));
  assert.match(html, /crm-to-sheet/);
  assert.match(html, /<td>No<\/td>/);
  assert.ok(html.includes('&quot;enabled&quot;: false'));
});

test('report text additions are escaped and repeated generation is deterministic', () => {
  const report = analyze(example('fan-out'));
  report.reason = '<script>reason()</script>';
  report.notes.push('<img src=x onerror=alert(1)>');
  const html = htmlReport(report);
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes(escapeHtml(report.reason)));
  assert.equal(htmlReport(report), html);
});
