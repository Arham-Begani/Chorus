/**
 * The demo video, as data.
 *
 * One array of beats. Each beat owns a slice of the timeline and declares what
 * is on screen and what the caption says. `render.mjs` seeks this timeline
 * frame by frame, so the output is deterministic: the same timeline always
 * produces the same frames regardless of how fast the machine is.
 *
 * Two hard constraints from the submission rules, both encoded here rather
 * than left to chance:
 *   - the first spoken sentence must name the hackathon
 *   - the whole thing must be under two minutes
 *
 * `npm run check` in this directory asserts both.
 */

// 60, because the piece is almost entirely slow continuous motion — pans across
// the shots, drifting aurora, easing reveals — and that is precisely the content
// 30fps renders as stepping. Nothing is captured in real time (see render.mjs),
// so the frame rate costs render minutes and nothing else.
export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * Shot kinds:
 *   card     — full-screen motion-graphics card, no app footage
 *   diagram  — animated derivation diagram (handle -> commitment/nullifier)
 *   app      — a captured screenshot of the real UI, framed and slowly zoomed
 *   split    — app footage on the left, a callout panel on the right
 *   table    — the public/never-public comparison, revealed row by row
 *
 * Per-beat presentation fields, all optional:
 *   chapter  — small label in the top-left, so a viewer always knows where
 *              they are in the argument
 *   accent   — 'cyan' | 'violet' | 'pink' | 'match' | 'bad'; tints the caption
 *              rule, the chapter label and the beat's ambient light
 *   flash    — fire a one-off light burst when the beat's payoff lands
 */

export const BEATS = [
  {
    id: 'title',
    kind: 'card',
    duration: 6,
    chapter: 'Chorus',
    accent: 'cyan',
    title: 'CHORUS',
    subtitle: 'A scam report that nobody can read\nuntil someone else independently makes the same one.',
    caption: 'This is my demo for Brainwave 2026 Midnight Track.',
  },
  {
    id: 'problem',
    kind: 'card',
    duration: 8,
    chapter: '01 · The problem',
    accent: 'bad',
    title: 'The first person to report',
    subtitle: 'bears the whole cost and gets nothing back.',
    body: [
      'They hand over their identity and the amount they lost.',
      'Nobody tells them whether anyone else reported the same handle,',
      'because nobody knows.',
    ],
    caption:
      'When someone is defrauded through a payment handle, the most useful fact in the world is that other people were hit by the same handle. That fact almost never surfaces in time.',
  },
  {
    id: 'insight',
    kind: 'card',
    duration: 7,
    chapter: '02 · The constraint',
    accent: 'violet',
    title: 'A public list cannot work',
    subtitle: 'It is a defamation surface. Requiring accounts to fix that\nbuilds a registry of who reported whom.',
    body: ['So the register must be public, and unreadable, at the same time.'],
    caption:
      'Every public scam blacklist fails the same two ways. So Chorus makes the register unreadable — you can only confirm a handle you already hold.',
  },
  {
    id: 'derivation',
    kind: 'diagram',
    duration: 10,
    chapter: '03 · How it works',
    accent: 'cyan',
    caption:
      'Your device hashes the handle, then derives two values: a commitment to the handle, and a nullifier unique to you and that handle. Only those two 32-byte values are published.',
  },
  {
    id: 'report-a',
    kind: 'app',
    duration: 11,
    chapter: '04 · Reporter A',
    accent: 'violet',
    shot: 'report-a-derived.png',
    focus: 'report',
    annotate: { target: 'derivation', label: 'derived before anything is sent' },
    caption:
      'Reporter A enters the handle that took their money. It becomes two opaque hashes in the browser, before it leaves the browser.',
  },
  {
    id: 'ledger-1',
    kind: 'split',
    duration: 9,
    chapter: '05 · What got published',
    accent: 'cyan',
    shot: 'ledger-after-a.png',
    focus: 'ledger',
    // Travel down the page to the ledger panel — this is the beat where the
    // register is meant to be legible as a wall of hashes.
    panFrom: 0.15,
    panTo: 1,
    panel: {
      title: 'Public ledger',
      // Values that are purely a number count up on screen; anything else is
      // written straight out. 'nowhere' is the row that matters.
      rows: [
        ['totalReports', '1'],
        ['commitments', '1'],
        ['reportCount', '1'],
        ['the handle', 'nowhere'],
      ],
    },
    caption: 'One commitment, count one. The handle appears nowhere on the chain, and it never will.',
  },
  {
    id: 'report-b',
    kind: 'app',
    duration: 9,
    chapter: '06 · Reporter B',
    accent: 'violet',
    shot: 'report-b-submitted.png',
    focus: 'report',
    caption:
      'Reporter B types the same handle, independently. Same handle always derives the same commitment — so the count goes to two. Still nothing legible.',
  },
  {
    id: 'report-c',
    kind: 'app',
    duration: 13,
    chapter: '07 · The threshold',
    accent: 'match',
    flash: true,
    shot: 'report-c-matched.png',
    focus: 'match',
    // Start on the Report panel where MATCHED appears, then drift down far
    // enough that the flagged row in the ledger is visible too.
    panFrom: 0,
    panTo: 0.75,
    annotate: { target: 'match', label: 'threshold reached', place: 'below' },
    emphasis: true,
    caption:
      'Reporter C reports it. The threshold is three, and it flips. Three strangers who cannot identify each other just learned they were hit by the same operator — and the handle itself was never published.',
  },
  {
    id: 'duplicate',
    kind: 'app',
    duration: 10,
    chapter: '08 · No inflating it',
    accent: 'bad',
    shot: 'report-c-rejected.png',
    focus: 'report',
    panFrom: 0.1,
    panTo: 0.35,
    annotate: { target: 'rejected', label: 'rejected at the contract', place: 'below' },
    caption:
      'Reporter C tries again. The contract refuses it: that nullifier is already spent. The count cannot be inflated, and the chain still does not know who anyone is.',
  },
  {
    id: 'check',
    kind: 'app',
    duration: 12,
    chapter: '09 · The free half',
    accent: 'cyan',
    shot: 'check-matched.png',
    focus: 'check',
    // The measured box for this shot is the Check panel's result block, so the
    // label has to describe that, not the panel's header. It hangs below,
    // because directly above it is the commitment the shot exists to show.
    annotate: { target: 'check-label', label: 'answered with no transaction', place: 'below' },
    caption:
      'Check is the other half. Paste a handle you are about to pay and the answer is instant — because it is a local hash and a public read. No transaction. No record that you asked.',
  },
  {
    id: 'public-private',
    kind: 'table',
    duration: 10,
    chapter: '10 · The whole disclosure',
    accent: 'pink',
    caption:
      'Public, permanently: commitments, counts, nullifiers, a match flag. Never public: the handle, the amount, who reported, or which nullifiers belong to the same person.',
  },
  {
    id: 'close',
    kind: 'card',
    duration: 7,
    chapter: 'Chorus',
    accent: 'match',
    flash: true,
    title: 'Threshold sealed at 3',
    subtitle: 'Contract compiles clean · 11/11 behavioural tests pass',
    body: [
      'Everything shown here is the compiled Compact circuits executing.',
      'Testnet deployment is the one remaining step.',
    ],
    // Accuracy over polish: claiming a testnet deployment that has not
    // happened would be the one thing in this video a judge could disprove.
    // The app footage carries its own SIMULATED MODE banner for the same
    // reason.
    caption:
      'The threshold is sealed in the constructor, so nobody — including whoever deploys it — can ever change it. Every derivation you just saw was computed by the real circuits.',
  },
];

export const totalDuration = () => BEATS.reduce((sum, beat) => sum + beat.duration, 0);

/** Absolute start time of each beat, in seconds. */
export const withOffsets = () => {
  let at = 0;
  return BEATS.map((beat) => {
    const start = at;
    at += beat.duration;
    return { ...beat, start, end: at };
  });
};

export const totalFrames = () => Math.round(totalDuration() * FPS);
