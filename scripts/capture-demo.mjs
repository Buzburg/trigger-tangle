import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { ffmpeg: { type: 'string', default: process.env.FFMPEG_EXE || 'ffmpeg' } } });
const fps = 30, seconds = 20, width = 1280, height = 720;
await mkdir('dist', { recursive: true });
await mkdir('.state/demo-frames', { recursive: true });
const input = resolve('dist/trigger-tangle-demo.html');
const output = resolve('dist/trigger-tangle-20s.mp4');
const stagedOutput = resolve('.state/demo-frames/rendering.mp4');
const frozenInput = resolve('.state/demo-frames/source.html');
const sourceHtml = await readFile(input);
await writeFile(frozenInput, sourceHtml);
const browser = await chromium.launch();
let encoder;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(pathToFileURL(frozenInput).href + '?capture=1');
  await page.evaluate(() => document.fonts.ready);
  const evidence = await page.evaluate(() => window.demoEvidence);
  if (!evidence || errors.length || requests.length) throw Error('Demo did not initialize cleanly and offline');
  encoder = spawn(values.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-frames:v', String(fps * seconds), '-movflags', '+faststart', stagedOutput],
    { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let encoderError = null, diagnostic = '';
  encoder.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8000); });
  encoder.stdin.on('error', error => { encoderError = error; });
  const finished = new Promise((resolveDone, reject) => {
    encoder.once('error', reject);
    encoder.once('exit', code => code === 0 ? resolveDone() : reject(Error('Video encoder failed: ' + diagnostic)));
  });
  // Observe failures immediately while frames are captured, without an unhandled rejection.
  finished.catch(error => { encoderError = error; });
  const checkpoints = new Map([[0, 'opening'], [6 * fps, 'loop'], [11 * fps, 'guard'], [16 * fps, 'verified'], [19 * fps, 'closing']]);
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    if (encoderError) throw encoderError;
    await page.evaluate(ms => window.renderDemoAt(ms), frame * 1000 / fps);
    const png = await page.screenshot({ type: 'png' });
    if (checkpoints.has(frame)) await writeFile(`.state/demo-frames/${checkpoints.get(frame)}.png`, png);
    if (!encoder.stdin.write(png)) await Promise.race([
      once(encoder.stdin, 'drain'),
      finished.then(() => { throw Error('Video encoder finished before all frames were sent'); }),
    ]);
    if (frame % (fps * 5) === 0) console.log(`Rendered ${frame / fps} / ${seconds} seconds`);
  }
  encoder.stdin.end();
  await finished;
  if (errors.length || requests.length) throw Error('Demo produced errors or unexpected network requests');
  const sha256 = data => createHash('sha256').update(data).digest('hex');
  const manifest = { schema: 'trigger-tangle.demo/v1', kind: 'illustrated synthetic walkthrough',
    seconds, fps, frames: fps * seconds, width, height, audio: false,
    sourceHtmlSha256: sha256(sourceHtml), videoSha256: sha256(await readFile(stagedOutput)), evidence };
  if (sha256(await readFile(input)) !== manifest.sourceHtmlSha256) throw Error('Demo HTML changed during capture; rebuild and capture again');
  await rename(stagedOutput, output);
  await writeFile('dist/trigger-tangle-demo-evidence.json', JSON.stringify(manifest, null, 2) + '\n');
  const sumsPath = 'dist/SHA256SUMS.txt';
  const sums = (await readFile(sumsPath, 'utf8')).split('\n').filter(line => line && !/  trigger-tangle-(?:20s\.mp4|demo-evidence\.json)$/.test(line));
  for (const name of ['trigger-tangle-20s.mp4', 'trigger-tangle-demo-evidence.json']) {
    sums.push(`${sha256(await readFile('dist/' + name))}  ${name}`);
  }
  await writeFile(sumsPath, sums.join('\n') + '\n');
  console.log(JSON.stringify({ output, seconds, frames: fps * seconds, sha256: manifest.videoSha256 }));
} finally {
  if (encoder?.pid && encoder.exitCode === null && encoder.signalCode === null) {
    const closed = once(encoder, 'close');
    encoder.kill();
    await closed;
  }
  await browser.close();
  await rm(stagedOutput, { force: true });
}
