import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Blueprint } from '../../src/types';

const app = pathToFileURL(resolve('dist/trigger-tangle.html')).href;
async function ready(page: Page): Promise<void> {
  await expect(page.locator('#status')).toContainText('Rehearsal complete');
  await expect(page.locator('#results')).toBeVisible();
}
async function fillBuilder(page: Page): Promise<void> {
  await page.locator('#sync-builder').evaluate(element => { const panel = element.closest('details'); if (panel) panel.open = true; });
  await page.getByLabel('First system / resource', { exact: true }).fill('my-sales/accounts');
  await page.getByLabel('Second system / resource', { exact: true }).fill('my-billing/accounts');
}
test.beforeEach(async ({ context, page }) => {
  await context.setOffline(true);
  await page.goto(app);
  await ready(page);
  await fillBuilder(page);
});

test('builds a custom two-way sync and can rehearse the marker rule without JSON', async ({ page }) => {
  await page.getByLabel('Event name', { exact: true }).fill('changed');
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await ready(page);
  await expect(page.locator('#seed')).toContainText('my-sales/accounts');
  await expect(page.locator('#trace')).toContainText('my-billing/accounts');
  await expect(page.locator('#current-result')).toHaveText('Loop found');
  await page.getByLabel('Stop marked changes from returning', { exact: true }).check();
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await ready(page);
  await expect(page.locator('#current-result')).toHaveText('Settles for this seed');
  await expect(page.locator('#starts-count')).toHaveText('1');
  await expect(page.locator('#workflow-list')).toContainText('origin ≠ "triggertangle-sync"');
  await page.locator('#editor-panel').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save blueprint', exact: true }).click();
  const path = await (await downloaded).path();
  expect(path).not.toBeNull();
  const blueprint = JSON.parse(await readFile(path!, 'utf8')) as Blueprint;
  expect(blueprint.seed).toEqual({ resource: 'my-sales/accounts', event: 'changed', data: {} });
  expect(blueprint.workflows.every(workflow => workflow.when?.[0]?.op === 'notEquals')).toBe(true);
});

test('invalid builder drafts keep the last valid design and report intact', async ({ page }) => {
  const original = await page.locator('#blueprint').inputValue();
  await page.getByLabel('Second system / resource', { exact: true }).fill('my-sales/accounts');
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await expect(page.locator('#sync-builder-error')).toContainText('two different resource IDs');
  await expect(page.locator('#sync-builder-error')).toBeFocused();
  await expect(page.locator('#blueprint')).toHaveValue(original);
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#current-result')).toHaveText('Loop found');
  await page.getByLabel('Second system / resource', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await expect(page.locator('#sync-builder-error')).toContainText('Second system / resource');
  await page.getByLabel('Second system / resource', { exact: true }).fill('new-resource');
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await ready(page);
  await expect(page.locator('#sync-builder-error')).toBeHidden();
});

test('resource names render as text and the opened builder is accessible on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const literal = '<img src=x onerror=alert(1)>';
  await page.getByLabel('First system / resource', { exact: true }).fill(literal);
  await page.getByRole('button', { name: 'Build my rehearsal' }).click();
  await ready(page);
  await expect(page.locator('#seed')).toContainText(literal);
  await expect(page.locator('#seed img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include('#sync-builder').analyze();
  expect(accessibility.violations).toEqual([]);
});
