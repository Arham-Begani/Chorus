/**
 * Emit caption sidecar files from the same timeline the video is rendered from.
 *
 * The captions are burned into the picture by the director, but a sidecar is
 * what makes the video searchable and accessible on a submission page, and
 * generating it from the same source means the two can never disagree.
 *
 *   node video/captions.mjs
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { totalDuration, withOffsets } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, 'out');

const pad = (n, width = 2) => String(Math.floor(n)).padStart(width, '0');

const stamp = (seconds, msSeparator) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSeparator}${pad(ms, 3)}`;
};

/**
 * Long captions are split across two cues so a line never outstays the shot it
 * belongs to. Split on sentence boundaries, which is where a reader pauses.
 */
const cuesFor = (beat) => {
  const text = (beat.caption ?? '').trim();
  if (text === '') {
    return [];
  }

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [text];
  if (sentences.length < 2 || text.length < 130) {
    return [{ start: beat.start, end: beat.end, text }];
  }

  // Weight each cue by its share of the characters, so a long sentence holds
  // the screen longer than a short one.
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  let at = beat.start;
  return sentences.map((sentence) => {
    const span = (sentence.length / totalChars) * beat.duration;
    const cue = { start: at, end: Math.min(at + span, beat.end), text: sentence };
    at += span;
    return cue;
  });
};

const run = async () => {
  await fs.mkdir(outDir, { recursive: true });

  const cues = withOffsets().flatMap(cuesFor);

  const vtt = ['WEBVTT', '', ...cues.flatMap((c) => [`${stamp(c.start, '.')} --> ${stamp(c.end, '.')}`, c.text, ''])];

  const srt = cues.flatMap((c, i) => [
    String(i + 1),
    `${stamp(c.start, ',')} --> ${stamp(c.end, ',')}`,
    c.text,
    '',
  ]);

  await fs.writeFile(path.join(outDir, 'chorus-demo.vtt'), `${vtt.join('\n')}\n`, 'utf8');
  await fs.writeFile(path.join(outDir, 'chorus-demo.srt'), `${srt.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${cues.length} cues to out/chorus-demo.vtt and out/chorus-demo.srt`);

  // Both submission rules are asserted here rather than trusted, because both
  // are silent failures: a video that is 120.4s long looks fine right up until
  // it is disqualified.
  const first = cues[0]?.text ?? '';
  if (!/Brainwave 2026 Midnight Track/i.test(first)) {
    console.error(`FAIL: first caption does not name the hackathon: "${first}"`);
    process.exit(1);
  }
  console.log(`First line OK: "${first}"`);

  const duration = totalDuration();
  if (duration >= 120) {
    console.error(`FAIL: timeline is ${duration}s — must be UNDER two minutes.`);
    process.exit(1);
  }
  console.log(`Duration OK: ${duration}s (${(120 - duration).toFixed(0)}s of margin)`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
