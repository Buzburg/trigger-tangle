import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parseBlueprint } from '../src/model.js';
import type { Analysis, Blueprint } from '../src/types.js';

const executable = resolve('dist/trigger-tangle.mjs');
function cli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [executable, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 2_000_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function minimal(): Blueprint {
  return { version: 1, name: 'Local test', seed: { resource: 'crm', event: 'updated', data: {} }, workflows: [] };
}

async function inTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'triggertangle-cli-test-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('CLI help lists examples, result codes and limited-model scope', () => {
  for (const flag of ['--help', '-h']) {
    const result = cli([flag]);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /contact-loop/);
    assert.match(result.stdout, /0 settles, 1 loop found in model, 2 inconclusive, 3 invalid/);
    assert.match(result.stdout, /One seed only/);
  }
});

test('CLI built-in examples return their exact JSON status and exit codes', () => {
  for (const [example, status, code] of [
    ['contact-loop', 'loop-found', 1], ['guarded-sync', 'settles', 0],
    ['self-reply', 'loop-found', 1], ['fan-out', 'settles', 0],
  ] as const) {
    const result = cli(['--example', example, '--format', 'json']);
    assert.equal(result.status, code);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout) as Analysis;
    assert.equal(report.schema, 'triggertangle.report/v1');
    assert.equal(report.status, status);
    assert.equal(report.complete, true);
    assert.equal(Boolean(report.witness), status === 'loop-found');
    assert.doesNotThrow(() => parseBlueprint(JSON.stringify(report.blueprint)));
  }
});

test('CLI incomplete exploration returns exit 2 without completion counts', () => {
  const result = cli(['--example', 'contact-loop', '--max-states', '1', '--format', 'json']);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout) as Analysis;
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.complete, false);
  assert.equal(report.stats.workflowStarts, null);
  assert.equal(report.stats.emittedEvents, null);
});

test('CLI disable intervention changes only the selected rehearsal', () => {
  const result = cli(['--example', 'contact-loop', '--disable', 'sheet-to-crm', '--disable', 'sheet-to-crm', '--format', 'json']);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout) as Analysis;
  assert.equal(report.status, 'settles');
  assert.equal(report.blueprint.workflows.find((workflow) => workflow.id === 'sheet-to-crm')?.enabled, false);
  assert.equal(cli(['--example', 'contact-loop']).status, 1);
  const unknown = cli(['--example', 'contact-loop', '--disable', 'unknown']);
  assert.equal(unknown.status, 3);
  assert.equal(unknown.stdout, '');
  assert.match(unknown.stderr, /Unknown workflow ID/);
});

test('CLI blueprint export round-trips through a local UTF-8 file without modification', async () => {
  await inTemporaryDirectory(async (directory) => {
    const exported = cli(['--example', 'contact-loop', '--disable', 'sheet-to-crm', '--blueprint']);
    assert.equal(exported.status, 0);
    assert.equal(exported.stderr, '');
    const blueprint = parseBlueprint(exported.stdout);
    const path = join(directory, 'blueprint.json');
    await writeFile(path, exported.stdout, 'utf8');
    const result = cli([path, '--format', 'json']);
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout) as Analysis;
    assert.deepEqual(report.blueprint, blueprint);
    assert.equal(await readFile(path, 'utf8'), exported.stdout);
  });
});

test('CLI rejects ambiguous sources, unknown options, repeated options and missing values', () => {
  for (const args of [
    [], ['--not-an-option'], ['one.json', 'two.json'],
    ['one.json', '--example', 'fan-out'], ['--example', 'missing'],
    ['--example'], ['--example', '--format', 'json'],
    ['--example', 'fan-out', '--format', 'xml'],
    ['--example', 'fan-out', '--format', 'json', '--format', 'text'],
    ['--example', 'fan-out', '--blueprint', '--blueprint'],
    ['--example', 'fan-out', '--example', 'guarded-sync'],
  ]) {
    const result = cli(args);
    assert.equal(result.status, 3, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^TriggerTangle: /);
  }
});

test('CLI rejects malformed, out-of-range and repeated budgets', () => {
  for (const args of [
    ['--max-states', '0'], ['--max-states', '513'], ['--max-states', '-1'], ['--max-states', '1.5'],
    ['--max-transitions', '8193'], ['--max-transitions', 'NaN'], ['--max-states', '1e2'],
    ['--max-states', '1', '--max-states', '2'],
  ]) {
    const result = cli(['--example', 'fan-out', ...args]);
    assert.equal(result.status, 3, JSON.stringify(args));
    assert.equal(result.stdout, '');
  }
});

test('CLI accepts UTF-8 Unicode data and an optional UTF-8 BOM', async () => {
  await inTemporaryDirectory(async (directory) => {
    const blueprint = minimal();
    blueprint.name = 'México 日本 🎯';
    blueprint.seed.data = { sample: 'naïve résumé 📨' };
    for (const bom of [false, true]) {
      const path = join(directory, bom ? 'bom.json' : 'unicode.json');
      await writeFile(path, (bom ? '\ufeff' : '') + JSON.stringify(blueprint), 'utf8');
      const result = cli([path, '--format', 'json']);
      assert.equal(result.status, 0);
      assert.deepEqual((JSON.parse(result.stdout) as Analysis).blueprint, blueprint);
    }
  });
});

test('CLI rejects malformed UTF-8 instead of silently replacing undecodable bytes', async () => {
  await inTemporaryDirectory(async (directory) => {
    const path = join(directory, 'invalid-utf8.json');
    const text = JSON.stringify({ ...minimal(), name: 'marker' });
    const offset = text.indexOf('marker');
    await writeFile(path, Buffer.concat([Buffer.from(text.slice(0, offset)), Buffer.from([0xc3, 0x28]), Buffer.from(text.slice(offset + 6))]));
    const result = cli([path]);
    assert.equal(result.status, 3);
    assert.equal(result.stdout, '');
  });
});

test('CLI rejects directories, missing files, oversized files and oversized decoded text', async () => {
  await inTemporaryDirectory(async (directory) => {
    const oversized = join(directory, 'too-many-bytes.json');
    const tooLong = join(directory, 'too-many-characters.json');
    await writeFile(oversized, Buffer.alloc(800_001, 32));
    await writeFile(tooLong, JSON.stringify(minimal()).padEnd(200_001, ' '));
    for (const path of [directory, join(directory, 'missing.json'), oversized, tooLong]) {
      const result = cli([path]);
      assert.equal(result.status, 3);
      assert.equal(result.stdout, '');
    }
  });
});

test('CLI text output and errors escape terminal control characters', async () => {
  const error = cli(['--example', 'fan-out', '--disable', '\u001b[31mnot-a-workflow\nforged output']);
  assert.equal(error.status, 3);
  assert.equal(error.stderr.includes('\u001b'), false);
  assert.equal(error.stderr.trimEnd().split('\n').length, 1);
  await inTemporaryDirectory(async (directory) => {
    const blueprint = minimal();
    blueprint.seed.data = { hostile: '\u001b[31mred\nforged output' };
    blueprint.workflows = [{ id: 'self', name: 'Self', on: { resource: 'crm', event: 'updated' }, emit: [{ resource: 'crm', event: 'updated' }] }];
    const path = join(directory, 'controls.json');
    await writeFile(path, JSON.stringify(blueprint));
    const result = cli([path]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes('\u001b'), false);
    assert.match(result.stdout, /\\u001b/);
    assert.equal(result.stdout.includes('\nforged output'), false);
  });
});

test('CLI HTML output includes the reproducible blueprint and finite-model limitation', () => {
  const result = cli(['--example', 'contact-loop', '--format', 'html']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^<!doctype html>/);
  assert.match(result.stdout, /Reproducible blueprint/);
  assert.match(result.stdout, /Repeating chain/);
  assert.match(result.stdout, /No live apps were checked or changed/);
});
