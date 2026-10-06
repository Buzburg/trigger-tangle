import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('dist', { recursive: true });
const license = await readFile('LICENSE', 'utf8');
const common = { bundle: true, minify: true, target: 'es2022', legalComments: 'inline', write: false };
const worker = await build({ ...common, entryPoints: ['src/worker.ts'], format: 'iife' });
const app = await build({ ...common, entryPoints: ['src/main.ts'], format: 'iife', define: { __WORKER_SOURCE__: JSON.stringify(worker.outputFiles[0].text) } });
const script = app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await transform(await readFile('src/styles.css', 'utf8'), { loader: 'css', minify: true });
const hash = createHash('sha256').update(script).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; worker-src blob:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
let html = await readFile('src/index.html', 'utf8');
for (const marker of ['<!-- CSP -->', '<!-- STYLE -->', '<!-- SCRIPT -->']) if (!html.includes(marker)) throw new Error(`Missing HTML build marker: ${marker}`);
html = html.replace('<!-- CSP -->', () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`).replace('<!-- STYLE -->', () => `<style>${css.code}</style>`).replace('<!-- SCRIPT -->', () => `<script>${script}</script>`).replace('<html lang="en">', () => `<!--\n${license}\n-->\n<html lang="en">`);
await writeFile('dist/trigger-tangle.html', html);
await mkdir('dist/site', { recursive: true });
await writeFile('dist/site/index.html', html);
await build({ entryPoints: ['src/cli.ts'], outfile: 'dist/trigger-tangle.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'inline', banner: { js: `/*\n${license}\n*/` } });
await build({ entryPoints: ['src/harness-cli.ts'], outfile: 'dist/trigger-tangle-harness.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'inline', banner: { js: `/*\n${license}\n*/` } });
const sums = [];
for (const name of ['trigger-tangle.html', 'trigger-tangle.mjs', 'trigger-tangle-harness.mjs']) {
  const data = await readFile(`dist/${name}`); sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
  console.log(`${name}: ${data.length.toLocaleString('en-US')} bytes`);
}
await writeFile('dist/SHA256SUMS.txt', `${sums.join('\n')}\n`);
