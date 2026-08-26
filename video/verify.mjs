/**
 * Verify the rendered video — is it real, and is it actually smooth?
 *
 * The first question is the easy one: a file of the right size can still be
 * truncated or two minutes of black, so frames are pulled from across the
 * timeline and written out to be looked at.
 *
 * The second question is the one that matters here, because the previous
 * pipeline's failure was invisible to every check that only asked "is there a
 * picture". Chromium's built-in recorder screencasts at whatever rate the page
 * happens to paint; when a frame is late the recorder repeats the one before
 * it. The file still claims a constant frame rate and still has content in
 * every frame — it just stutters, because a stutter IS a repeated frame.
 *
 * So the smoothness test is: decode every frame, and count how many are
 * near-identical to the one before. On a timeline that is in continuous motion
 * from beginning to end, a repeated frame can only be a stall.
 *
 *   node verify.mjs                 # check out/chorus-demo.mp4
 *   node verify.mjs --compare       # ...and contrast with the old recording
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out');
const framesDir = path.resolve(outDir, 'verify');

const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith('--')) ?? path.join(outDir, 'chorus-demo.mp4');
const compare = argv.includes('--compare');

const SAMPLE_AT = [1, 10, 21, 33, 45, 55, 64, 78, 88, 99, 108];

const ffmpeg = (args) =>
  new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args);
    let text = '';
    proc.stdout.on('data', (d) => (text += d));
    proc.stderr.on('data', (d) => (text += d));
    proc.on('close', () => resolve(text));
  });

/** ffmpeg-static ships no ffprobe, so read the stream banner ffmpeg prints. */
const probe = async (file) => {
  const out = await ffmpeg(['-hide_banner', '-i', file]);
  const duration = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const stream = out.match(/Stream #0:0.*?: Video: (\w+).*?, (\d+)x(\d+).*?, ([\d.]+) fps/s);
  const bitrate = out.match(/bitrate: (\d+) kb\/s/);
  return {
    seconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : NaN,
    codec: stream?.[1] ?? '?',
    width: Number(stream?.[2] ?? 0),
    height: Number(stream?.[3] ?? 0),
    fps: Number(stream?.[4] ?? 0),
    kbps: Number(bitrate?.[1] ?? 0),
  };
};

/** Final `frame=N` from an ffmpeg stats line. */
const frameCount = (log) => {
  const all = [...log.matchAll(/frame=\s*(\d+)/g)];
  return all.length > 0 ? Number(all.at(-1)[1]) : NaN;
};

/**
 * Count frames that are effectively repeats of their predecessor.
 *
 * mpdecimate drops a frame when too few 8x8 blocks changed. The thresholds are
 * pulled far below the defaults on purpose: at the defaults it would also drop
 * frames that merely changed *slightly*, and a slow pan is full of those. At
 * hi=64/lo=32 with frac=0.001, a frame survives if as little as a tenth of a
 * percent of it moved at all — so anything dropped here really is a stall.
 */
const stalls = async (file) => {
  const plain = await ffmpeg(['-hide_banner', '-i', file, '-an', '-f', 'null', '-']);
  const kept = await ffmpeg([
    '-hide_banner', '-i', file, '-an',
    '-vf', 'mpdecimate=hi=64:lo=32:frac=0.001',
    '-f', 'null', '-',
  ]);
  const total = frameCount(plain);
  const distinct = frameCount(kept);
  return { total, distinct, repeated: total - distinct };
};

const check = async (label, file) => {
  const info = await probe(file);
  const { size } = await fs.stat(file);
  const { total, distinct, repeated } = await stalls(file);
  const pct = total > 0 ? (repeated / total) * 100 : NaN;

  console.log(`${label}`);
  console.log(`   file       ${path.basename(file)}  ${(size / 1024 / 1024).toFixed(1)} MB  ${info.kbps} kb/s`);
  console.log(`   video      ${info.codec} ${info.width}x${info.height} @ ${info.fps} fps  ${info.seconds.toFixed(2)}s`);
  console.log(`   frames     ${total} decoded, ${distinct} distinct`);
  console.log(`   repeated   ${repeated} (${pct.toFixed(2)}%)${repeated === 0 ? '  — no stalls' : ''}`);
  console.log();
  return { info, total, repeated, pct };
};

const run = async () => {
  await fs.access(target).catch(() => {
    console.error(`No such file: ${target}\nRun \`npm run render\` first.`);
    process.exit(1);
  });

  console.log();
  const main = await check('RENDERED', target);

  if (compare) {
    const old = path.join(outDir, 'previous-recorder.webm');
    if (await fs.access(old).then(() => true).catch(() => false)) {
      await check('PREVIOUS (Chromium screen recorder)', old);
    } else {
      console.log(`(no previous recording at ${old} to compare against)\n`);
    }
  }

  // Sample frames, so the file can be judged by eye and not only by numbers.
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });
  for (const t of SAMPLE_AT) {
    if (t >= main.info.seconds) continue;
    await ffmpeg([
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(t), '-i', target, '-frames:v', '1',
      path.join(framesDir, `t${String(t).padStart(3, '0')}.png`),
    ]);
  }
  const written = (await fs.readdir(framesDir)).length;
  console.log(`Sampled ${written} frames into ${framesDir}`);

  /* ---- the assertions ---- */
  const problems = [];
  if (main.info.width !== 1920 || main.info.height !== 1080) {
    problems.push(`expected 1920x1080, got ${main.info.width}x${main.info.height}`);
  }
  if (main.info.seconds >= 120) {
    problems.push(`${main.info.seconds.toFixed(1)}s — the submission limit is two minutes`);
  }
  // A little tolerance: a couple of held frames across two minutes would be a
  // legitimate creative choice. Anything more is the recorder stuttering.
  if (main.pct > 1) {
    problems.push(`${main.pct.toFixed(2)}% of frames are repeats — the video stalls`);
  }

  console.log();
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL: ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${main.info.seconds.toFixed(1)}s, ${main.info.fps}fps, no stalls.`);
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
