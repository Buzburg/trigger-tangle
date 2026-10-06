import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Analysis, Blueprint } from '../../src/types';

const app = pathToFileURL(resolve('dist/trigger-tangle.html')).href;
async function ready(page: Page): Promise<void> {
  await expect(page.locator('#status')).toContainText('Rehearsal complete');
  await expect(page.locator('#results')).toBeVisible();
}
async function openEditor(page: Page): Promise<void> {
  await page.locator('#editor-panel').evaluate((details: HTMLDetailsElement) => { details.open = true; });
}
async function apply(page: Page, blueprint: Blueprint): Promise<void> {
  await openEditor(page);
  await page.locator('#blueprint').fill(JSON.stringify(blueprint, null, 2));
  await page.getByRole('button', { name: 'Apply blueprint' }).click();
}
function finiteBlueprint(resource = 'review/inbox'): Blueprint {
  return {
    version: 1,
    name: 'A small independent test',
    seed: { resource, event: 'created', data: { owner: 'example' } },
    workflows: [{ id: 'archive', name: 'Queue a review', on: { resource, event: 'created' }, emit: [{ resource: 'review/queue', event: 'waiting' }] }],
  };
}
test.beforeEach(async ({ context, page }) => {
  await context.setOffline(true);
  await page.goto(app);
});

test('standalone app works offline without external requests', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await ready(page);
  await expect(page.locator('#result-title')).toContainText('keep each other running');
  await expect(page.locator('#states-count')).toHaveText('2');
  await expect(page.locator('#trace .trace-step')).toHaveCount(2);
  await expect(page.locator('#trace')).toContainText('Signal #0 returns');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
test('switching a workflow off compares against the unchanged baseline', async ({ page }) => {
  await ready(page);
  const toggle = page.getByRole('switch', { name: 'Enable Copy sheet changes to the CRM' });
  await toggle.uncheck();
  await ready(page);
  await expect(page.locator('#baseline-result')).toHaveText('Loop found');
  await expect(page.locator('#current-result')).toHaveText('Settles for this seed');
  await expect(page.locator('#starts-count')).toHaveText('1');
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Reset switches' }).click();
  await ready(page);
  await expect(toggle).toBeChecked();
  await expect(page.locator('#current-result')).toHaveText('Loop found');
});
test('marker, self-reply and handoff examples have distinct verified outcomes', async ({ page }) => {
  await ready(page);
  await page.locator('[data-example="guarded-sync"]').click();
  await ready(page);
  await expect(page.locator('#current-result')).toHaveText('Settles for this seed');
  await expect(page.locator('#starts-count')).toHaveText('1');
  await expect(page.locator('#workflow-list')).toContainText('origin ≠ "contact-sync"');
  await page.locator('[data-example="self-reply"]').click();
  await ready(page);
  await expect(page.locator('#current-result')).toHaveText('Loop found');
  await expect(page.locator('.trace-step')).toHaveCount(1);
  await page.locator('[data-example="fan-out"]').click();
  await ready(page);
  await expect(page.locator('#states-count')).toHaveText('4');
  await expect(page.locator('#starts-count')).toHaveText('3');
});
test('editing invalidates reports and locks switches until the blueprint is applied', async ({ page }) => {
  await ready(page);
  await openEditor(page);
  await page.locator('#blueprint').fill(JSON.stringify(finiteBlueprint()));
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#status')).toContainText('Blueprint edited');
  await expect(page.getByRole('switch').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save blueprint', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Apply blueprint' }).click();
  await ready(page);
  await expect(page.locator('#current-result')).toHaveText('Settles for this seed');
  await expect(page.locator('#baseline-result')).toHaveText('Settles for this seed');
  await expect(page.getByRole('switch')).toBeEnabled();
});
test('invalid JSON leaves no stale report and can recover through an example', async ({ page }) => {
  await ready(page);
  await openEditor(page);
  await page.locator('#blueprint').fill('{"version":1,');
  await page.getByRole('button', { name: 'Apply blueprint' }).click();
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('[data-example="fan-out"]').click();
  await ready(page);
  await expect(page.locator('#error')).toBeHidden();
});
test('imports a valid JSON file and rejects an oversized one', async ({ page }) => {
  await ready(page);
  await openEditor(page);
  await page.locator('#import').setInputFiles({ name: 'blueprint.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(finiteBlueprint())) });
  await ready(page);
  await expect(page.locator('#scenario-description')).toContainText('Imported blueprint: A small independent test');
  await page.locator('#import').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(800_001, ' ') });
  await expect(page.locator('#error')).toContainText('800 KB');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#import')).toHaveValue('');
});
test('rejects oversized text and unsupported live-platform exports', async ({ page }) => {
  await ready(page);
  await openEditor(page);
  await page.locator('#import').setInputFiles({ name: 'text-limit.json', mimeType: 'application/json', buffer: Buffer.from(`${JSON.stringify(finiteBlueprint())}${' '.repeat(200_001)}`) });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#import').setInputFiles({ name: 'n8n.json', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[],"connections":{}}') });
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#results')).toBeHidden();
});
test('invalid UTF-8 is rejected without silently changing resource identities', async ({ page }) => {
  await ready(page);
  await openEditor(page);
  const json = JSON.stringify(finiteBlueprint('encoding-marker'));
  const bytes = Buffer.from(json);
  bytes[bytes.indexOf('encoding-marker')] = 0xff;
  await page.locator('#import').setInputFiles({ name: 'invalid-encoding.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('#error')).toContainText('valid UTF-8 JSON');
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#import').setInputFiles({ name: 'with-bom.json', mimeType: 'application/json', buffer: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json)]) });
  await ready(page);
  await expect(page.locator('#seed')).toContainText('encoding-marker');
});
test('untrusted names render as text in the app and standalone report', async ({ page }, testInfo) => {
  const malicious = '<img src=x onerror="alert(1)">';
  const blueprint = finiteBlueprint(malicious);
  blueprint.name = malicious;
  blueprint.workflows[0]!.name = malicious;
  await apply(page, blueprint);
  await ready(page);
  await expect(page.locator('#seed')).toContainText(malicious);
  await expect(page.locator('img')).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save readable report' }).click();
  const download = await downloadEvent;
  const path = testInfo.outputPath('readable-report.html');
  await download.saveAs(path);
  await page.goto(pathToFileURL(path).href);
  await expect(page.getByRole('heading', { name: 'This modeled handoff settles' })).toBeVisible();
  await expect(page.locator('body')).toContainText(malicious);
  await expect(page.locator('img')).toHaveCount(0);
});
test('JSON report exports the current intervention and full model evidence', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch', { name: 'Enable Copy sheet changes to the CRM' }).uncheck();
  await ready(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  const report = JSON.parse(await readFile(path!, 'utf8')) as Analysis;
  expect(report.schema).toBe('triggertangle.report/v1');
  expect(report.status).toBe('settles');
  expect(report.blueprint.workflows[1]!.enabled).toBe(false);
  expect(report.stats.workflowStarts).toBe('1');
  expect(report.states).toHaveLength(2);
  expect(report.complete).toBe(true);
});
test('blueprint export preserves switches and can be imported again', async ({ page }) => {
  await ready(page);
  await page.getByRole('switch').first().uncheck();
  await ready(page);
  await openEditor(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save blueprint', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  const blueprint = JSON.parse(await readFile(path!, 'utf8')) as Blueprint;
  expect(blueprint.workflows[0]!.enabled).toBe(false);
  await page.locator('#import').setInputFiles({ name: 'round-trip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(blueprint)) });
  await ready(page);
  await expect(page.getByRole('switch').first()).not.toBeChecked();
  await expect(page.locator('#starts-count')).toHaveText('0');
});
test('a budget-limited exploration remains explicitly inconclusive', async ({ page }) => {
  const blueprint = finiteBlueprint();
  blueprint.seed.resource = 'stage-0';
  blueprint.workflows = Array.from({ length: 24 }, (_, index) => ({
    id: `step-${index}`, name: `Step ${index}`, on: { resource: `stage-${index}`, event: 'created' }, emit: [{ resource: `stage-${index + 1}`, event: 'created' }],
  }));
  await apply(page, blueprint);
  await ready(page);
  await page.locator('#budget').selectOption('small');
  await expect(page.locator('#results')).toBeHidden();
  await page.getByRole('button', { name: 'Run rehearsal' }).click();
  await expect(page.locator('#status')).toContainText('Exploration incomplete');
  await expect(page.locator('#current-result')).toHaveText('Inconclusive');
  await expect(page.locator('#starts-count')).toHaveText('—');
  await expect(page.locator('#trace-tag')).toHaveText('PARTIAL EXPLORATION');
  await expect(page.locator('#trace')).not.toContainText('No matching workflow');
});
test('keyboard switches retain focus and show the new result', async ({ page }) => {
  await ready(page);
  const toggle = page.getByRole('switch').first();
  await toggle.focus();
  await page.keyboard.press('Space');
  await ready(page);
  await expect(toggle).toBeFocused();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#starts-count')).toHaveText('0');
});
test('cancelling a worker leaves no partial result presented as complete', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(): void { /* Simulate a worker that remains busy. */ }
      terminate(): void { /* The application must handle a silent worker. */ }
    } as unknown as typeof Worker;
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Rehearsal cancelled');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Run rehearsal' })).toBeEnabled();
});
test('an already-queued worker response cannot restore a result after editing', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      private inner: Worker;
      constructor(url: string | URL, options?: WorkerOptions) {
        this.inner = new OriginalWorker(url, options);
        this.inner.onmessage = event => {
          document.documentElement.dataset.responseQueued = 'true';
          window.setTimeout(() => this.onmessage?.(event), 10_000);
        };
        this.inner.onerror = event => { this.onerror?.(event); };
        this.inner.onmessageerror = event => { this.onmessageerror?.(event); };
      }
      postMessage(message: unknown): void { this.inner.postMessage(message); }
      terminate(): void { this.inner.terminate(); }
    } as unknown as typeof Worker;
  });
  await page.clock.install();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.responseQueued === 'true');
  await openEditor(page);
  await page.locator('#blueprint').fill(JSON.stringify(finiteBlueprint()));
  await page.clock.fastForward(10_001);
  await expect(page.locator('#status')).toContainText('Blueprint edited');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Run rehearsal' })).toBeEnabled();
});
test('a stalled worker times out with an actionable error', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      postMessage(): void { /* Deliberately remain silent to test the boundary. */ }
      terminate(): void { /* No background process exists in this stub. */ }
    } as unknown as typeof Worker;
  });
  await page.clock.install();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await page.clock.fastForward(30_001);
  await expect(page.locator('#error')).toContainText('exceeded 30 seconds');
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Run rehearsal' })).toBeEnabled();
});
test('the result and editor are accessible with keyboard-friendly labels', async ({ page }) => {
  await ready(page);
  const initial = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(initial.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.locator('[data-example="guarded-sync"]').click();
  await ready(page);
  await openEditor(page);
  await page.locator('.notes-panel').evaluate((details: HTMLDetailsElement) => { details.open = true; });
  const expanded = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(expanded.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
});
test('small and wide layouts fit without horizontal scrolling', async ({ page }, testInfo) => {
  await ready(page);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Run rehearsal' })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('workbench-mobile.png'), fullPage: true });
});
