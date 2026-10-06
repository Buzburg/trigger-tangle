import { build } from 'esbuild';
import { readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir('tests')).filter(name => name.endsWith('.test.ts')).sort();
if (!files.length) throw new Error('No unit tests found.');
await mkdir('.test-build', { recursive: true });
await build({ entryPoints: files.map(name => `tests/${name}`), outdir: '.test-build', bundle: true, platform: 'node', format: 'esm', target: 'node22', outExtension: { '.js': '.mjs' } });
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files.map(name => `.test-build/${name.replace(/\.ts$/, '.mjs')}`)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
