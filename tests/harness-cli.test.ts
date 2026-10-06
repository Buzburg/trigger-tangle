import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import type { HarnessReport, HarnessSuite } from '../src/harness';
import type { Blueprint } from '../src/types';

const runner = resolve('dist/trigger-tangle-harness.mjs');
const baselinePath = resolve('examples/contact-loop.json');
const candidatePath = resolve('examples/guarded-sync.json');
const suitePath = resolve('examples/contact-suite.json');
const args = ['--baseline', baselinePath, '--candidate', candidatePath, '--suite', suitePath];
type BoundReport = HarnessReport & {
  evidence: { runnerVersion: string; baselineTextSha256: string; candidateTextSha256: string; suiteTextSha256: string };
  inputs: { baseline: Blueprint; candidate: Blueprint; suite: HarnessSuite };
};
function cli(options = args): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [runner, ...options], { encoding: 'utf8', timeout: 15_000, maxBuffer: 2_000_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
async function temporary(run: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tangle-harness-'));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('harness CLI binds both-direction rehearsal to unchanged input text and never grants execution', async () => {
  const texts = await Promise.all([baselinePath, candidatePath, suitePath].map(path => readFile(path, 'utf8')));
  const result = cli();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout) as BoundReport;
  assert.equal(report.status, 'review-required');
  assert.equal(report.executionAllowed, false);
  assert.equal(report.cases.length, 2);
  assert.ok(report.cases.every(item => item.baseline.status === 'blocked' && item.candidate.status === 'review-required'));
  assert.deepEqual(report.evidence, {
    runnerVersion: '0.3.0', baselineTextSha256: sha(texts[0]!), candidateTextSha256: sha(texts[1]!), suiteTextSha256: sha(texts[2]!),
  });
  assert.deepEqual(Object.values(report.inputs), texts.map(text => JSON.parse(text) as unknown));
  assert.deepEqual(await Promise.all([baselinePath, candidatePath, suitePath].map(path => readFile(path, 'utf8'))), texts);
});

test('harness CLI returns blocked for loops and inconclusive for truncated exploration', () => {
  const loop = cli(['--baseline', baselinePath, '--candidate', baselinePath, '--suite', suitePath]);
  assert.equal(loop.status, 1);
  assert.equal((JSON.parse(loop.stdout) as HarnessReport).status, 'blocked');
  const limited = cli([...args, '--max-states', '1']);
  assert.equal(limited.status, 2);
  const report = JSON.parse(limited.stdout) as HarnessReport;
  assert.equal(report.status, 'inconclusive');
  assert.equal(report.executionAllowed, false);
  assert.equal(report.budget.maxStates, 1);
  assert.ok(report.cases.every(item => !item.candidate.complete && item.candidate.stats.workflowStarts === null));
});

test('harness CLI rejects a settled candidate that discards the required business work', async () => {
  await temporary(async directory => {
    const file = join(directory, 'disabled.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8')) as Blueprint;
    for (const workflow of candidate.workflows) workflow.enabled = false;
    await writeFile(file, JSON.stringify(candidate));
    const result = cli(['--baseline', candidatePath, '--candidate', file, '--suite', suitePath]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout) as HarnessReport;
    assert.deepEqual(report.regressions, ['human-crm-change', 'human-sheet-change']);
    assert.ok(report.cases.every(item => item.candidate.analysisStatus === 'settles' && item.candidate.status === 'blocked'));
  });
});

test('harness CLI rejects malformed arguments and budgets without producing a report', () => {
  for (const invalid of [[], ['--help', 'extra'], [...args, '--suite', suitePath], [...args, '--max-states', '0'], [...args, '--max-states', '513'], [...args, '--max-transitions', '8193'], [...args, '--max-states', '1.5'], [...args, '--execute'], ['--baseline']]) {
    const result = cli(invalid);
    assert.equal(result.status, 3, JSON.stringify(invalid));
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.startsWith('TriggerTangle Harness: '));
  }
});

test('harness inputs reject malformed UTF-8, unsupported suite fields and oversized files', async () => {
  await temporary(async directory => {
    const file = join(directory, 'suite.json');
    const suite = JSON.parse(await readFile(suitePath, 'utf8')) as HarnessSuite;
    for (const content of [Buffer.from([0xc3, 0x28]), Buffer.alloc(800_001, 32), Buffer.from(JSON.stringify({ ...suite, executionAllowed: true }))]) {
      await writeFile(file, content);
      const result = cli(['--baseline', baselinePath, '--candidate', candidatePath, '--suite', file]);
      assert.equal(result.status, 3);
      assert.equal(result.stdout, '');
    }
  });
});

test('harness evidence hashes decoded UTF-8 text, stripping only a leading BOM', async () => {
  await temporary(async directory => {
    const file = join(directory, 'suite.json');
    const source = await readFile(suitePath, 'utf8');
    await writeFile(file, `\uFEFF${source}`);
    const result = cli(['--baseline', baselinePath, '--candidate', candidatePath, '--suite', file]);
    assert.equal(result.status, 0);
    assert.equal((JSON.parse(result.stdout) as BoundReport).evidence.suiteTextSha256, sha(source));
  });
});

test('all distinct required outcomes must be emitted, not just the first', async () => {
  await temporary(async directory => {
    const file = join(directory, 'suite.json');
    const source = JSON.parse(await readFile(suitePath, 'utf8')) as HarnessSuite;
    source.cases[0]!.required.push({ resource: 'audit/log', event: 'recorded' });
    await writeFile(file, JSON.stringify(source));
    const result = cli(['--baseline', baselinePath, '--candidate', candidatePath, '--suite', file]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout) as HarnessReport;
    assert.deepEqual(report.cases[0]!.candidate.required.map(item => item.observed), [true, false]);
    assert.equal(report.cases[0]!.candidate.status, 'blocked');
  });
});

test('both command-line help screens match the package version', async () => {
  const version = (JSON.parse(await readFile('package.json', 'utf8')) as { version: string }).version;
  const harness = cli(['--help']);
  assert.equal(harness.status, 0);
  assert.ok(harness.stdout.includes(version));
  const single = spawnSync(process.execPath, [resolve('dist/trigger-tangle.mjs'), '--help'], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(single.status, 0);
  assert.ok(single.stdout.includes(version));
});
