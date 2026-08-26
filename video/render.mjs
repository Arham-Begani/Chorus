/**
 * Render the demo video offline, one frame at a time.
 *
 * The director drives every animation from a single `seek(t)`, so the honest
 * way to record it is to ask for each frame by number and photograph it:
 *
 *     for f in 0..N:  __renderFrame(f / fps)  ->  screenshot  ->  ffmpeg
 *
 * Nothing is captured in real time, so nothing can be dropped, doubled or
 * unevenly spaced. A machine that takes 40ms per frame and one that takes 400ms
 * put the same picture at the same timestamp — how long a frame took to draw
 * has no way to influence when it is shown. That is the reason it comes out
 * smooth:
 * the previous pipeline used Chromium's own recorder, which screencasts at
 * whatever rate the page happens to paint, and a 90px-blur aurora over a
 * 1920x1080 stage does not paint at a steady 60Hz on any machine. Frame timing
 * came out of the compositor's back pressure rather than the timeline, which is
 * exactly what judder is.
 *
 *   node render.mjs                    # 60fps H.264 to out/chorus-demo.mp4
 *   node render.mjs --fps 30 --draft   # quick look
 *   node render.mjs --webm             # also emit VP9
 *
 * Notes on the choices here, all of them measured on this machine rather than
 * assumed — see the header comments on each for what the numbers were.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { serveVideoDir } from './serve.mjs';
import { withOffsets, totalDuration, WIDTH, HEIGHT, FPS } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out');

/* ---------- options ---------- */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1];
};

const draft = flag('draft');
const fps = Number(opt('fps', draft ? 30 : FPS));
// 19 is visually transparent for this material and lands the 112s at a size a
// submission page will actually accept; 16 roughly doubled it for no difference
// anyone can see.
const crf = Number(opt('crf', draft ? 26 : 19));
const preset = opt('preset', draft ? 'veryfast' : 'slow');
const quality = Number(opt('quality', draft ? 80 : 95));
const keepFrames = flag('keep-frames');
const wantWebm = flag('webm');
const fresh = flag('fresh');

// A capture normally takes ~100ms. This is not a deadline, it is a tripwire for
// a genuinely wedged browser — set high enough that ordinary contention between
// workers never trips it.
const SHOT_TIMEOUT = 120_000;

// Chromium's screenshot path is the bottleneck and it is per-process: three
// pages inside one browser measured 184ms/frame, the same as one page, while
// three separate browser processes measured 111ms. Cap at cores - 1 so the
// encode and the OS still get a core.
const workers = Math.max(1, Math.min(Number(opt('workers', 3)), Math.max(1, os.cpus().length - 1)));

const framesDir = path.resolve(opt('frames-dir', path.join(outDir, 'frames')));
const mp4Path = path.resolve(opt('out', path.join(outDir, 'chorus-demo.mp4')));
const webmPath = mp4Path.replace(/\.mp4$/, '.webm');

/* ---------- work division ---------- */

const beats = withOffsets();
const duration = totalDuration();
const totalFrames = Math.round(duration * fps);

/**
 * Assign whole BEATS to workers, never a fraction of one.
 *
 * Splitting mid-beat is what would show. Every animated value is a pure
 * function of time — that was verified by diffing the DOM state of a page that
 * played into a moment against one that jumped straight to it, and every
 * transform, offset and opacity matched exactly. What does not match is
 * Chromium's choice of image resampler: once it decides an element is
 * animating it switches to a cheaper filter, so a page that jumped in cold
 * rasterises the scaled screenshot slightly differently (peak 26/255 on a
 * handful of edge pixels) than one that has been stepping through it. That is
 * invisible in isolation but it would land as a one-frame texture pop at every
 * seam.
 *
 * Beat boundaries have no such seam: `mount()` rebuilds the scene there anyway,
 * and the scene's opacity is 0 at a beat's first frame and eases up over half a
 * second, so the frames where a worker's rasterisation is still settling are
 * the frames nothing is visible in.
 *
 * Longest-first bin packing, because the beats are 6-13s and naive round-robin
 * leaves a worker holding the two longest.
 */
const assign = () => {
  const bins = Array.from({ length: workers }, () => ({ beats: [], frames: 0 }));
  const ordered = beats
    .map((beat) => ({
      ...beat,
      from: Math.round(beat.start * fps),
      to: Math.round(beat.end * fps),
    }))
    .sort((a, b) => b.to - b.from - (a.to - a.from));

  for (const beat of ordered) {
    const lightest = bins.reduce((min, bin) => (bin.frames < min.frames ? bin : min));
    lightest.beats.push(beat);
    lightest.frames += beat.to - beat.from;
  }

  // Render each worker's beats in timeline order: the shots are then requested
  // roughly in the order the browser cached them.
  for (const bin of bins) bin.beats.sort((a, b) => a.from - b.from);
  return bins.filter((bin) => bin.beats.length > 0);
};

/* ---------- progress ---------- */

let done = 0;
// Frames inherited from a previous run. They cost no time now, so they must not
// count towards the rate or the ETA reads as minutes of work already finished.
let resumed = 0;
const startedAt = Date.now();
let lastPrint = 0;

const report = (force = false) => {
  const now = Date.now();
  if (!force && now - lastPrint < 2000) return;
  lastPrint = now;

  const elapsed = (now - startedAt) / 1000;
  const rate = (done - resumed) / Math.max(elapsed, 0.001);
  const left = rate > 0 ? (totalFrames - done) / rate : 0;
  const pct = ((done / totalFrames) * 100).toFixed(1);
  const bar = '#'.repeat(Math.round((done / totalFrames) * 30)).padEnd(30, '.');
  process.stdout.write(
    `\r  [${bar}] ${pct}%  ${done}/${totalFrames}  ${rate.toFixed(1)} fps  eta ${Math.round(left)}s   `,
  );
};

/* ---------- one worker ---------- */

const framePath = (f) => path.join(framesDir, `frame-${String(f).padStart(6, '0')}.jpg`);

/**
 * Render one beat, from a page that is already parked on its opening frame.
 *
 * Kept separate from the worker loop so a beat can be retried whole. Retrying
 * anything smaller would not be safe: a beat has to be rendered start to finish
 * by one page for the resampler to stay in the same state throughout (see
 * `assign`), so resuming in the middle of one is not a shortcut, it is a seam.
 */
const renderBeat = async (page, beat) => {
  // Warm-up: render the beat's opening frame and throw the capture away, so the
  // resampler is in its steady state before anything is kept.
  await page.evaluate((t) => window.__renderFrame(t), beat.from / fps);
  await page.screenshot({ type: 'jpeg', quality, timeout: SHOT_TIMEOUT });

  for (let f = beat.from; f < beat.to; f += 1) {
    await page.evaluate((t) => window.__renderFrame(t), f / fps);
    await page.screenshot({ path: framePath(f), type: 'jpeg', quality, timeout: SHOT_TIMEOUT });
    done += 1;
    report();
  }
};

const renderBin = async (bin, url, index) => {
  const openPage = async () => {
    const browser = await chromium.launch({
      headless: true,
      // The full Chromium build, not Playwright's headless shell. The shell's
      // screenshot path measured 600ms/frame against 147ms here — a 4x
      // difference for identical pixels.
      channel: 'chromium',
      args: [
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--disable-lcd-text',
        // Several browsers at 1080p on a small machine is exactly the case
        // where the default /dev/shm-style budget bites.
        '--disable-dev-shm-usage',
      ],
    });
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__renderFrame === 'function');
    // Shots, measured boxes and webfonts. Without this the first frame of every
    // app beat is laid out against an image of zero height.
    await page.evaluate(() => window.__ready);
    return { browser, page };
  };

  let session = await openPage();

  try {
    for (const beat of bin.beats) {
      if (beat.skip) continue;

      for (let attempt = 1; ; attempt += 1) {
        const before = done;
        try {
          await renderBeat(session.page, beat);
          break;
        } catch (e) {
          // Under three concurrent 1080p browsers on four cores, a capture can
          // occasionally be starved past its timeout. That is contention, not
          // a broken timeline — so replace the browser and render the beat
          // again rather than losing the whole run.
          if (attempt > 3) throw e;
          done = before;
          process.stdout.write(
            `\n  worker ${index + 1}: beat '${beat.id}' failed (${String(e.message).split('\n')[0]}) — retry ${attempt}/3\n`,
          );
          await session.browser.close().catch(() => {});
          session = await openPage();
        }
      }
    }
  } finally {
    await session.browser.close().catch(() => {});
  }
};

/* ---------- encode ---------- */

const runFfmpeg = (args, label) =>
  new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let tail = '';
    proc.stderr.on('data', (d) => {
      tail = (tail + d).slice(-4000);
      const m = String(d).match(/frame=\s*(\d+)/);
      if (m) process.stdout.write(`\r  ${label}: frame ${m[1]}/${totalFrames}   `);
    });
    proc.on('close', (code) => {
      process.stdout.write('\r');
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${tail}`));
    });
  });

const encode = async () => {
  const input = ['-framerate', String(fps), '-start_number', '0', '-i', path.join(framesDir, 'frame-%06d.jpg')];

  // Tag the colour space explicitly. Untagged 1080p is guessed differently by
  // different players, and on a piece that is mostly deep blues a wrong guess
  // is a visible shift.
  const colour = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

  await runFfmpeg(
    [
      '-y', '-hide_banner', '-loglevel', 'error', '-stats',
      ...input,
      '-an',
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      // aq-mode 3 biases bitrate towards dark regions. Almost every frame here
      // is a dark gradient, which is exactly where 8-bit banding shows.
      '-x264-params', 'aq-mode=3',
      '-g', String(fps * 2),
      ...colour,
      '-movflags', '+faststart',
      mp4Path,
    ],
    'h264',
  );

  if (wantWebm) {
    await runFfmpeg(
      [
        '-y', '-hide_banner', '-loglevel', 'error', '-stats',
        ...input,
        '-an',
        '-c:v', 'libvpx-vp9',
        '-crf', String(crf + 14), '-b:v', '0',
        '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3',
        '-pix_fmt', 'yuv420p',
        ...colour,
        webmPath,
      ],
      'vp9',
    );
  }
};

/* ---------- run ---------- */

/**
 * Which beats are already fully and validly rendered?
 *
 * Resume is per beat, never per frame, for the same reason retries are: a beat
 * rendered half by one page and half by another has a seam in it.
 *
 * "Validly" matters — a run killed mid-capture leaves a truncated JPEG behind,
 * which ffmpeg will happily read as a smear. A complete JPEG ends with the
 * end-of-image marker, so check for it rather than trusting the file's
 * existence.
 */
const completeBeats = async () => {
  const tail = Buffer.alloc(2);
  const intact = async (f) => {
    let handle;
    try {
      handle = await fs.open(framePath(f), 'r');
      const { size } = await handle.stat();
      if (size < 1024) return false;
      await handle.read(tail, 0, 2, size - 2);
      return tail[0] === 0xff && tail[1] === 0xd9;
    } catch {
      return false;
    } finally {
      await handle?.close();
    }
  };

  const ids = new Set();
  for (const beat of beats) {
    const from = Math.round(beat.start * fps);
    const to = Math.round(beat.end * fps);
    let all = true;
    for (let f = from; f < to && all; f += 1) all = await intact(f);
    if (all) ids.add(beat.id);
  }
  return ids;
};

const run = async () => {
  if (fresh) await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const alreadyDone = fresh ? new Set() : await completeBeats();
  const bins = assign();
  for (const bin of bins) {
    for (const beat of bin.beats) {
      beat.skip = alreadyDone.has(beat.id);
      if (beat.skip) {
        done += beat.to - beat.from;
        resumed += beat.to - beat.from;
        bin.frames -= beat.to - beat.from;
      }
    }
  }

  console.log(`Chorus demo render`);
  console.log(`  timeline   ${duration.toFixed(1)}s, ${beats.length} beats`);
  console.log(`  output     ${WIDTH}x${HEIGHT} @ ${fps}fps -> ${totalFrames} frames`);
  console.log(`  encode     h264 crf ${crf} preset ${preset}${wantWebm ? ' + vp9' : ''}`);
  console.log(`  workers    ${bins.length}`);
  for (const [i, bin] of bins.entries()) {
    const todo = bin.beats.filter((b) => !b.skip).map((b) => b.id);
    console.log(`     #${i + 1}  ${String(bin.frames).padStart(4)} frames  ${todo.join(', ') || '(nothing to do)'}`);
  }
  if (alreadyDone.size > 0) {
    console.log(`  resuming   ${alreadyDone.size}/${beats.length} beats already rendered — pass --fresh to redo them`);
  }
  console.log();

  if (duration >= 120) {
    console.warn(`WARNING: timeline is ${duration}s — the submission limit is two minutes.\n`);
  }

  const working = bins.filter((bin) => bin.beats.some((b) => !b.skip));
  if (working.length > 0) {
    const server = await serveVideoDir();
    try {
      console.log('Rendering frames...');
      await Promise.all(working.map((bin, i) => renderBin(bin, server.url, i)));
      report(true);
      console.log(`\n  ${totalFrames} frames in ${((Date.now() - startedAt) / 1000).toFixed(0)}s\n`);
    } finally {
      await server.close();
    }
  } else {
    console.log('All beats already rendered — encoding from existing frames.\n');
  }

  // Every frame index must exist, or ffmpeg's image2 reader stops at the first
  // gap and silently produces a short video.
  const written = (await fs.readdir(framesDir)).filter((f) => f.endsWith('.jpg')).length;
  if (written !== totalFrames) {
    throw new Error(`expected ${totalFrames} frames, found ${written} — refusing to encode a truncated video`);
  }

  console.log('Encoding...');
  await encode();

  const { size } = await fs.stat(mp4Path);
  console.log(`\nWrote ${mp4Path} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  if (wantWebm) {
    const webm = await fs.stat(webmPath);
    console.log(`Wrote ${webmPath} (${(webm.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  if (!keepFrames) await fs.rm(framesDir, { recursive: true, force: true });
  console.log(`Total ${((Date.now() - startedAt) / 1000 / 60).toFixed(1)} min`);
};

run().catch((e) => {
  console.error(`\n${e.stack ?? e}`);
  process.exit(1);
});
