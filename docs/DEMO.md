# The 20-second walkthrough

[Watch with playback controls](https://buzburg.github.io/trigger-tangle/demo.html) or download `trigger-tangle-20s.mp4` from the release. The silent, captioned MP4 is 1280 × 720, 30 frames per second, exactly 600 frames. The standalone `trigger-tangle-demo.html` works offline; its optional workbench links open the public site.

| Time | What it shows |
| --- | --- |
| 0–4 seconds | A human CRM change triggers a useful copy to a sheet. |
| 4–9 seconds | The copy triggers a copy back: the declared rules contain a repeating cycle. |
| 9–14 seconds | An origin marker filters out the feedback trigger. |
| 14–18 seconds | Two separate human-seed tests verify useful updates still reach the opposite resource. |
| 18–20 seconds | An invitation to try the workbench. |

The graphics illustrate synthetic rules. Counts, cycle status and required outcomes come from the actual analyzer and checked-in examples. This is not a recording of connected CRM or spreadsheet accounts. Timing, retries, concurrency and live platform behavior are outside the model. These checks grant no execution permission.

## Reproduce the video

Use Node.js 22+, the repository's locked development dependencies, Playwright Chromium and an FFmpeg executable with `libx264` support:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run build
node scripts/capture-demo.mjs --ffmpeg /path/to/ffmpeg
```

Omit `--ffmpeg` when FFmpeg is on PATH, or set `FFMPEG_EXE`. FFmpeg is only a video build tool; neither downloadable HTML file needs it. The release workflow installs it from Ubuntu's package repository.

The capture script opens the offline HTML at a fixed viewport, calls `window.renderDemoAt(ms)` for each frame, and feeds PNGs directly to the encoder. It rejects page errors and unexpected HTTP requests. Capturing does not run a clock-based screen recording, so a slow computer does not change the duration. Fonts and encoder versions can change the resulting bytes across platforms.

Outputs under `dist/`:

- `trigger-tangle-20s.mp4`: the shareable video.
- `trigger-tangle-demo-evidence.json`: actual reports, dimensions, frame count, and source/video SHA-256 digests.
- `SHA256SUMS.txt`: updated checksums for all release downloads.

The evidence file records what was rendered; it is not an authenticated third-party attestation. Five review stills are saved under the ignored `.state/demo-frames/` directory. The release workflow decodes the finished video and checks its 600-frame count before publication.

## Verification

Browser tests check analyzer agreement, both required outcomes, playback and keyboard seeking, reduced-motion behavior, frame clamping, offline operation, mobile overflow and automated accessibility rules. Playback starts paused; viewers choose when to start it.
