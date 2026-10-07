import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyze } from '../../src/engine';
import { EXAMPLES } from '../../src/examples';

const demo = pathToFileURL(resolve('dist/site/demo.html')).href;
test.beforeEach(async ({ context, page }) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(demo + '?capture=1');
});

test('illustration is calculated from both actual examples and both human seed directions', async ({ page }) => {
  const evidence = await page.evaluate(() => window.demoEvidence);
  expect(evidence.loop).toEqual(analyze(EXAMPLES.find(item => item.id === 'contact-loop')!.blueprint));
  expect(evidence.guardedForward).toEqual(analyze(EXAMPLES.find(item => item.id === 'guarded-sync')!.blueprint));
  const reverse = structuredClone(EXAMPLES.find(item => item.id === 'guarded-sync')!.blueprint);
  reverse.seed.resource = 'sheets/contacts';
  expect(evidence.guardedReverse).toEqual(analyze(reverse));
  expect(evidence.loop.status).toBe('loop-found');
  expect(evidence.guardedForward.status).toBe('settles');
  expect(evidence.guardedReverse.status).toBe('settles');
  expect(evidence.outcomes).toEqual({ crmToSheet: true, sheetToCrm: true });
  expect(await page.evaluate(() => Object.isFrozen(window.demoEvidence) && Object.isFrozen(window.demoEvidence.loop.states))).toBe(true);
});

test('each scene reports real model results and keeps its limitations visible', async ({ page }) => {
  await expect(page.locator('#playback')).toBeHidden();
  for (const [time, scene] of [[0, 'intro'], [4000, 'loop'], [9000, 'guard'], [14000, 'verify'], [18000, 'cta']] as const) {
    await page.evaluate(milliseconds => window.renderDemoAt(milliseconds), time);
    await expect(page.locator('#demo')).toHaveAttribute('data-scene', scene);
    await expect(page.locator('.disclosure')).toContainText('No live workflows');
    await expect(page.locator('.disclosure')).toContainText('Retries, timing & concurrency are not modeled');
    const bounds = await page.locator('.disclosure').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
    if (scene === 'loop') await expect(page.locator('#outcome-value')).toHaveText('2 transitions in the cycle');
    if (scene === 'guard') await expect(page.locator('#outcome-value')).toHaveText('1 workflow start · 1 emitted event');
    if (scene === 'verify') await expect(page.locator('#outcome-value')).toHaveText('2 / 2 declared outcomes reached');
  }
  await expect(page.getByRole('link', { name: 'Try TriggerTangle' })).toBeVisible();
});

test('capture renders deterministic frames with clamped times and no network or storage', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await page.evaluate(() => window.renderDemoAt(5500));
  const first = await page.locator('#demo').innerHTML();
  await page.evaluate(() => window.renderDemoAt(19000));
  await page.evaluate(() => window.renderDemoAt(5500));
  expect(await page.locator('#demo').innerHTML()).toBe(first);
  await page.evaluate(() => window.renderDemoAt(-10));
  await expect(page.locator('#demo')).toHaveAttribute('data-scene', 'intro');
  await page.evaluate(() => window.renderDemoAt(22000));
  await expect(page.locator('#time')).toHaveText('0:20 / 0:20');
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('web playback supports keyboard controls and reduced motion starts paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(demo);
  await expect(page.getByRole('button', { name: 'Play walkthrough' })).toBeVisible();
  await expect(page.locator('#playback-status')).toContainText('Reduced motion: paused');
  const seek = page.getByRole('slider', { name: 'Position' });
  await seek.focus(); await page.keyboard.press('End');
  await expect(page.locator('#demo')).toHaveAttribute('data-scene', 'cta');
  await page.getByRole('button', { name: 'Play walkthrough' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#playback-status')).toHaveText('Paused.');
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-scene', 'intro');
  await page.evaluate(() => window.renderDemoAt(0));
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('walkthrough and controls fit mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto(demo);
  for (const time of [0, 5000, 10000, 15000, 19000]) {
    await page.evaluate(milliseconds => window.renderDemoAt(milliseconds), time);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
