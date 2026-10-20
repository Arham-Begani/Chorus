# Chorus

**CHORUS voice mission control:** [open the application project](voice/README.md) or [submission guide](voice/SUBMISSION.md). Speak or type an event goal, coordinate simulated vendor research, revise constraints and review a sourced plan. The responsive application, separate worker, PostgreSQL persistence and deployment files live in `voice/`. One answered Bolna call and scoped brief retrieval are verified; structured live coordination remains unverified. Real calling is disabled by default.

**Start in `voice/`:** [setup](voice/README.md) · [three-minute demo](voice/DEMO.md) · [architecture](voice/ARCHITECTURE.md) · [verified results](voice/VERIFICATION.md). [Latest verified CI](https://github.com/Arham-Begani/Chorus/actions/runs/39418268872) passed 153 tests, both container builds, worker recovery and database restore. The submission guide states the live-test limits and final owner steps.

## Earlier Midnight project

The separate Midnight project documented below is preserved. Its wallet, token and contract instructions are unrelated to the voice application.

A scam report that nobody can read until someone else independently makes the same one.

See [idea.md](idea.md) for the concept.

> **Status: M0 ✅ · M1 ✅ · M6 ✅ · M7 ✅ — M2–M5 blocked on faucet funding.**
>
> The toolchain is proven end-to-end against testnet (M0) and the Chorus contract
> compiles clean with 11/11 behavioural tests passing (M1). The API, CLI, reporter
> agent and UI are built, typecheck clean, and run end to end against the compiled
> circuits (M6). The demo video is recorded (M7).
>
> **What is not done: the Chorus contract is not yet deployed to testnet (M2), and
> so M3–M5 have not been demonstrated on chain.** The blocker is funding — the
> Preview faucet is behind a Cloudflare Turnstile captcha that cannot be scripted.
> Report, duplicate rejection and the threshold flip have all been demonstrated
> against the compiled contract in local simulation mode; see the table below for
> exactly what that does and does not prove.

---

## Quick start

**Full setup instructions, prerequisites and troubleshooting: [SETUP.md](SETUP.md).**

You can run Chorus right now with no wallet, no testnet funds, no Docker and no Compact
compiler. The compiled circuits and proving key are committed, and local simulation mode
runs them in process:

```bash
git clone https://github.com/Arham-Begani/Chorus.git ~/chorus
cd ~/chorus
npm install
npm run build

# terminal 1 — the reporter agent, in local simulation mode
CHORUS_NETWORK=local npm run agent --workspace @chorus/cli

# terminal 2 — the UI
npm run dev --workspace @chorus/ui
```

Open <http://localhost:5173>. Start the agent **before** the UI — it writes the deployment
record the frontend reads on load.

Report a handle three times as three different reporters and watch the commitment flip to
matched; then open the raw ledger panel and confirm there is no handle anywhere in it. The
circuits, the derivations, duplicate rejection and the threshold are all real in this mode;
the proof, the transaction and the chain are not. [SETUP.md](SETUP.md) has the exact table.

Verify the privacy claim directly:

```bash
npm run test --workspace @chorus/contract    # 11/11
```

### Documentation

| Document | What is in it |
|---|---|
| [SETUP.md](SETUP.md) | Prerequisites, both run paths, verification, troubleshooting, known limitations |
| [idea.md](idea.md) | The concept: the problem, the insight, and why this needs Midnight specifically |
| This README | The engineering log — verified versions, toolchain drift, circuit metrics, what broke and why |

---

## M0 — verified environment

Every version below was **observed on this machine**, not copied from docs. Where the docs
and the actual artifacts disagree, both are recorded — that drift is real and it bites.

### Host

| Component | Version | Notes |
|---|---|---|
| OS | Windows 10 Pro 19045.6466 | |
| WSL | 2.7.11.0 (kernel 6.18.33.2-2) | |
| Distro | Ubuntu 24.04.4 LTS (x86_64) | All Midnight tooling runs here |

**Windows cannot run this toolchain natively.** The docs state *"Development is supported on
Linux and Mac. Windows is not supported natively at this time, if you are using Windows,
development through WSL is recommended."* Confirmed independently: the `compact` v0.5.1
release publishes only `{x86_64,aarch64}-apple-darwin` and `{x86_64,aarch64}-unknown-linux-musl`.
There is no Windows build.

### Toolchain (inside WSL)

| Component | Version |
|---|---|
| Node.js | v24.19.0 |
| npm | 11.17.0 |
| `compact` (toolchain manager) | 0.5.1 |
| `compactc` (compiler) | 0.31.1 |
| `pragma language_version` | 0.23 |
| Docker Engine | 29.7.2 |
| Docker Compose | v5.3.1 |

`compact` and `compactc` are **separate version numbers**. Compiler `0.31.1` compiles
`pragma language_version 0.23` — verified with a throwaway probe contract before trusting
the scaffold.

Node 24 is not optional despite the docs saying "22+": the template pins
`"engines": { "node": ">=24.11.1" }`.

Install (docs command, verified):

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source "$HOME/.local/bin/env"
compact update          # installs the compiler; without this, `compact compile` fails
                        # with "No default compiler set"
```

### Proof server

| Source | Image tag |
|---|---|
| Docs install page | `midnightntwrk/proof-server:8.1.0` |
| **Scaffold `proof-server.yml` (actually used)** | **`midnightntwrk/proof-server:8.0.3`** |

The example launches its own proof server via testcontainers on a random host port, so
`8.0.3` is what actually serves proofs on the CLI path. A manually-run `8.1.0` on `:6300`
is only needed for the Lace wallet path.

```bash
docker run -d --name midnight-proof-server -p 6300:6300 \
  midnightntwrk/proof-server:8.1.0 midnight-proof-server -v
curl http://localhost:6300/health     # {"status":"ok","timestamp":"..."}
```

### Example project

Official example, contract **unmodified**:

```bash
npx create-mn-app chorus-m0 --template bboard -y   # create-mn-app v0.5.0
```

Produces `@midnight-ntwrk/example-bboard@0.1.0` — a 4-package workspace. The scaffold does
**not** auto-install:

```bash
cd chorus-m0
npm install
cd api && npm install && cd ..
cd contract && npm install && npm run compact && npm run build && cd ..
cd bboard-cli && npm install && npm run build && cd ..
cd bboard-ui  && npm install && npm run build && cd ..
```

Midnight SDK versions pinned by the template:

| Package | Version |
|---|---|
| `@midnight-ntwrk/midnight-js-*` | 4.1.1 |
| `@midnight-ntwrk/wallet-sdk` | 1.2.0 |
| `@midnight-ntwrk/dapp-connector-api` | 4.0.1 |
| `@midnight-ntwrk/testkit-js` | 4.1.1 |

## Verification status

All checks run against the built workspace:

| Package | typecheck | lint | tests |
|---|---|---|---|
| `contract` | ✅ | ✅ | ✅ **9/9 passed** (vitest) |
| `api` | ✅ | ✅ | — |
| `bboard-cli` | ✅ | ✅ | — |
| `bboard-ui` | ✅ | ✅ | — |

`npm run compact` → `Compiling 2 circuits:` exit 0. The two circuits with proving keys are
`post` and `takeDown`; `publicKey` is a pure circuit and emits no keys.

## Networks

| Endpoint | Preview | PreProd |
|---|---|---|
| RPC node `/health` | 200 | 200 |
| Indexer `/ready` | 200 | 200 |
| Faucet `/api/health` | 200 (was **503** for hours) | 200 |
| Chain height | ~472,136 | ~2,156,124 |

Preview's faucet returned **503** for an extended period. This blocks everything, because
the testkit health-checks the faucet at startup and aborts with
`Request failed with status code 503` before reaching any prompt — even though the chain
and indexer are perfectly healthy. It later recovered.

Switching networks is one word: `npm run preview-remote` vs `npm run preprod-remote`.

### PreProd endpoints

| | |
|---|---|
| Network ID | `preprod` |
| Indexer | `https://indexer.preprod.midnight.network/api/v4/graphql` |
| RPC node | `https://rpc.preprod.midnight.network` |
| Faucet | `https://midnight-tmnight-preprod.nethermind.dev/` |
| Proof server | testcontainer, random host port |

## Funding

The CLI generates its own wallet — **no Lace extension needed for the CLI path**. It prints
an unshielded `mn_addr_<network>1...` address and blocks on `Waiting to receive tokens...`
indefinitely (no timeout).

Paste that address into the faucet, solve the **Cloudflare Turnstile** captcha, request
tokens. The captcha means this step **cannot be automated** — a human must do it.

The faucet dispenses **tNIGHT**, which is then registered for **tDUST** generation; the CLI
does that second step automatically via `generate-dust.ts`. Older guides describing a direct
tDUST drip are out of date.

Verifying a faucet transaction against the indexer — note it is an `identifier`, **not** a
`hash` (querying `offset:{hash:...}` fails with `invalid transaction hash: cannot convert to
ByteArray<32>`):

```bash
curl -s -X POST https://indexer.preprod.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{transactions(offset:{identifier:\"<TXID>\"}){hash block{height} ... on RegularTransaction{transactionResult{status}} unshieldedCreatedOutputs{owner value}}}"}'
```

## Wallet sync is the slowest part — plan for it

This is the single biggest surprise in the whole setup and it will blindside a demo.

Before doing anything on-chain, the CLI waits for **all three** sub-wallets to sync:

```ts
const isFacadeStateSynced = (state) =>
  isProgressStrictlyComplete(state.shielded.state.progress) &&
  isProgressStrictlyComplete(state.dust.state.progress) &&
  isProgressStrictlyComplete(state.unshielded.progress);
```

Measured rates on PreProd (~2.16M blocks):

| wallet | items | rate | time |
|---|---|---|---|
| unshielded | 563,587 | instant | seconds |
| shielded | 1,441,741 | ~3,100/s | ~8 min |
| **dust** | **1,441,980** | **~60–104/s** | **~3.5–6 hr** |

The dust wallet syncs roughly **30× slower** than shielded and is the entire bottleneck.
It is **not skippable** — `generateDust()` opens with `await walletFacade.dust.waitForSyncedState()`,
so bypassing the CLI's own gate does not help.

**Sync time scales with chain history**, so prefer the shorter chain. Preview (~472K blocks)
synced in minutes what PreProd (~2.16M blocks) needed hours for.

There is **no persistence**: the CLI passes `txHistoryStorage: { storage: {} }` (in-memory),
so every restart re-scans from scratch. Budget for this before a live demo, and keep one
session alive rather than restarting.

### Seeing sync progress

By default the CLI logs at `info` and shows nothing while syncing — it looks hung for hours.
Set `DEBUG_LEVEL` to see per-wallet progress:

```bash
DEBUG_LEVEL=debug npm run preprod-remote
```

Note the three wallets use **different progress field names**, which makes naive logging
misleading:

* unshielded → `appliedId` / `highestTransactionId`
* shielded and dust → `appliedIndex` / `highestRelevantWalletIndex`

### Local patches (CLI harness only — contract untouched)

`bboard-cli/src/wallet-utils.ts` (original preserved as `wallet-utils.ts.orig`):

1. **Progress logging** that handles both field shapes and prints percentages.
2. **`isCompleteWithin(50n)` instead of `isStrictlyComplete()`.** `isStrictlyComplete()` is
   literally `isCompleteWithin(0n)` — it demands *zero* lag against a chain tip that keeps
   advancing. The SDK's own default tolerance is `maxGap = 50n`. Override via `SYNC_MAX_GAP`.

Both are in test-harness code. **The Compact contract is unmodified**, which is what M0
requires.

## Deployed contract ✅

The **unmodified** official bboard example, compiled and deployed to Midnight PreProd
testnet, with a confirmed circuit call and ledger state read back.

| | |
|---|---|
| Network | **PreProd** |
| Contract address | `065e342841e17b881d9d02c234a4eea7ae922e3516d5ba1a38547e27b606a944` |
| Deploy + `post` tx hash | `b00ae97cb198ce9a761259738350b2a74a2c163e78f788981ef0b07952e5edab` |
| Transaction result | **SUCCESS** |
| Block height | 2,173,800 |
| Fee | 1 |
| Dust generation tx | `00b21b2e334f8ceca1da29ebe958c33cdb6002f497af1276334e41243c685d02b3` |

Ledger state read back from chain after calling the `post` circuit:

```
Current state is:    'occupied'
Current message is:  'Chorus M0 verification'
Current sequence is: 1
Current owner is:    '1736761d71139fed723565b6fadd3f365a343ed2238a9d1d3e6dd3d47a4183b8'
```

`owner` is `persistentHash<Vector<3, Bytes<32>>>([pad(32, "bboard:pk:"), sequence, sk])` —
derived inside the circuit from the `localSecretKey()` witness. The secret key itself never
left the machine and appears nowhere on chain.

Independent on-chain verification (does not trust the CLI's own output):

```bash
curl -s -X POST https://indexer.preprod.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{contractAction(address:\"065e342841e17b881d9d02c234a4eea7ae922e3516d5ba1a38547e27b606a944\"){__typename address transaction{hash ... on RegularTransaction{transactionResult{status}} block{height}}}}"}'
# -> {"__typename":"ContractCall", ... "status":"SUCCESS", "height":2173800}
```

---

## M1 — the Chorus contract ✅

`contract/src/chorus.compact`. One circuit that writes, two pure derivations, no
`check` circuit by design.

```bash
cd contract
npm install
npm run ci      # compact -> typecheck -> lint -> build -> test
```

Full pipeline exits 0, **11/11 tests pass**.

### Public state

```compact
export ledger reportCount:      Map<Bytes<32>, Uint<64>>;  // commitment -> count
export ledger seenNullifiers:   Set<Bytes<32>>;            // spent nullifiers
export ledger matched:          Set<Bytes<32>>;            // at/over threshold
export ledger totalReports:     Counter;
export sealed ledger threshold: Uint<64>;                  // written once, in the constructor
```

`sealed` means the threshold cannot be changed after deployment by anyone, including
the deployer. That is a trust property of the deployment rather than a promise.

### Circuit metrics

The compiler exposes no row-count flag, so these are zkir-level figures with the official
bboard example as a reference point:

| circuit | zkir instructions | inputs | prover key |
|---|---|---|---|
| **Chorus `report`** | **224** | 2 | 5,203,398 B |
| bboard `post` (reference) | 94 | 1 | 2,826,482 B |
| bboard `takeDown` (reference) | 128 | 0 | 2,827,107 B |

~2.4× bboard's `post`, which is what two `persistentHash` calls plus Map/Set operations
cost. The `chorus:handle:v1` domain separator is visible in the compiled zkir as the
immediate `63686F7275733A68616E646C653A7631`.

### `persistentHash` needs an explicit type parameter

This does **not** compile:

```compact
persistentHash([pad(32, "chorus:handle:v1"), handleBytes])       // ✗
```

The vector type and arity are required:

```compact
persistentHash<Vector<2, Bytes<32>>>([pad(32, "chorus:handle:v1"), handleBytes])
persistentHash<Vector<3, Bytes<32>>>([pad(32, "chorus:nullifier:v1"), handleBytes, sk])
```

### Check is free because the derivations are pure circuits

`commitmentOf` and `nullifierOf` take no ledger state, so the compiler emits them as
**pure** functions:

```ts
export type PureCircuits = {
  commitmentOf(handleBytes: Uint8Array): Uint8Array;
  nullifierOf(handleBytes: Uint8Array, sk: Uint8Array): Uint8Array;
}
```

Check is therefore a local hash plus a public ledger read — no proof, no transaction, no
server request that could log the query. Deriving through the contract's own circuit
(rather than reimplementing the hash in TypeScript) also means client and chain cannot
drift apart.

`reportCount` is iterable in the generated `Ledger` type, which is what lets the raw
ledger panel enumerate commitment→count rows without resolving anything.

### Normalisation is the single point of failure

`contract/src/normalise.ts`. If two clients normalise differently, two victims of the same
scammer derive different commitments, never match, and Chorus silently does nothing —
there is no error for that failure mode, so it is tested directly.

Rules are deliberately conservative: NFKC, strip all whitespace, lowercase. Punctuation,
dots and plus-addressing are **not** stripped, because `a.b@upi` and `ab@upi` can be
different accounts and collapsing them would land one merchant's reports on another's
commitment.

### Tests

`npm run test` — 11 tests, including the one worth showing a judge: after three reports of
the same handle, neither the hashed handle, nor the raw handle string, nor any reporter's
secret key appears anywhere in public ledger state; every public value is exactly 32 bytes.

---

## Repository layout

| Package | What it is |
|---|---|
| `contract/` | The Compact contract, its witnesses, the normaliser, and 11 tests. |
| `api/` | `ChorusAPI` (deploy, join, report) and — separately — `api/read`, the half that cannot write. |
| `cli/` | The interactive driver, plus the local reporter agent the UI talks to. |
| `ui/` | Vite + React. Report, Check, and the raw ledger panel. |
| `video/` | Records the demo: captures the real UI, composites motion graphics, emits captions. |
| `deployment/` | One JSON record per network. How anything finds the deployed address. |

### A note on how the UI looks

Deep-night ground, aurora light, glass panels, saturated accents — but the point
of the visual language is a tension, not a mood. The page has to look built for
Midnight *and* make the hashes look like hashes, because the ledger reading as a
wall of meaningless bytes is the entire argument.

Those pull against each other, and the resolution is contrast of **type**, not
of colour: prose is set in the UI sans, and anything that is literally a byte
string is set in mono, in one uniform colour, at one weight. So the page can be
bright and the opaque values still read as inert. Accents are spent on chrome
and on state — never on making one hash look more interesting than another.

Two things are deliberately *not* prettified, and please do not add them: naming
commitments, or resolving one back to a handle even when the browser happens to
know the handle that produced it. A judge shown a friendly table of scammer
names has been shown the opposite of what Chorus does.

The split between `api/index.ts` and `api/read.ts` is deliberate and load-bearing.
`read.ts` imports nothing that needs a wallet, a proof server or private state. That
is what makes "checking involves no transaction" a structural property of the build
rather than a claim in a paragraph — the browser bundles `read.ts` and physically
cannot submit anything with it.

## How the pieces talk

```
REPORT   browser ──▶ reporter agent (localhost) ──▶ proof server ──▶ testnet
         handle normalised + SHA-256'd in the browser;
         only the 32 hashed bytes cross to the agent;
         only commitment + nullifier reach the chain

CHECK    browser ──▶ public indexer
         the agent is not involved and need not be running
```

### Local simulation mode

`CHORUS_NETWORK=local` runs the agent against the compiled contract in process
(`./run-local-agent.sh`). It exists because the faucet is captcha-gated, so a
machine without a funded wallet can still exercise the whole UI.

Be precise about what that does and does not mean:

| Real in local mode | Not real in local mode |
|---|---|
| The compiled Compact circuits | The zero-knowledge proof |
| Commitment and nullifier derivation | The transaction and its fee |
| Duplicate rejection — the contract's own `assert` refuses it | The chain; state is in memory and dies with the process |
| The threshold flip | |
| Normalisation | |

The agent reports `simulated: true` on `/api/status`, the UI renders a
**SIMULATED MODE** banner, and the ledger panel shows `network: local`. Output
from this mode must never be presented as testnet — the banner is deliberately
visible in the demo video's footage for that reason.

**Be clear about what the agent is.** Reporting needs a funded wallet, a proof server
and the ability to sign a transaction. In production that is the Lace extension's job.
In this build it is a local process holding the demo wallet and the three reporter
secret keys. It binds to `127.0.0.1` only.

**What is staged, stated plainly:** all three reporters are funded from one testnet
wallet, because the faucet is captcha-gated and three wallets would mean three
captchas. That is visible on chain as one payer. What is *not* staged: the three
reporter secret keys are independently random, so the three nullifiers are genuinely
unlinkable, and every report is a real proof and a real transaction.

## Setup

Requires WSL2 (Ubuntu), Node 24+, and Docker. See the M0 tables above for exact
verified versions.

```bash
# 1. install the Compact toolchain (inside WSL)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source "$HOME/.local/bin/env"
compact update

# 2. install dependencies
npm install

# 3. compile the contract and run its tests
npm run test --workspace @chorus/contract

# 4. build
npm run build
```

### Deploy

The faucet is behind a Cloudflare Turnstile captcha, so **a human has to do this step**
— it cannot be scripted or run in CI.

```bash
npm run deploy:preview          # or deploy:preprod
```

The CLI prints an unshielded `mn_addr_preview1...` address and blocks on
`Waiting to receive tokens...`. Paste that address into
<https://midnight-tmnight-preview.nethermind.dev/>, solve the captcha, request tokens.
It then registers the NIGHT for DUST generation automatically and drops into a menu.
Choose **1** to deploy; the address is written to `deployment/preview.json`.

Set `CHORUS_WALLET_SEED` to reuse a funded wallet and skip the captcha on later runs:

```bash
export CHORUS_WALLET_SEED=<64 hex chars>
```

**Prefer Preview over PreProd.** Wallet sync time scales with chain history, and the
dust wallet syncs ~30x slower than the shielded one. Preview's shorter chain syncs in
minutes what PreProd needs hours for. See "Wallet sync is the slowest part" above —
this will blindside a demo if you do not plan for it.

### Run the demo

Three terminals:

```bash
npm run agent      # reporter agent — holds the wallet and the three keys
npm run ui         # Vite dev server on :5173
node video/capture.mjs   # optional: drives the UI and screenshots it
```

Or drive everything from the CLI without a browser — option **5** in the main menu
runs M3, M4 and M5 back to back and prints a result you can verify against the indexer.

## The demo video

`video/out/chorus-demo.mp4` — 1920x1080 at 60fps, 1:52, with burned-in captions
and `chorus-demo.srt` / `.vtt` sidecars.

It is built, not filmed. Playwright drives the real UI, which drives the real
compiled circuits, and screenshots whatever actually happened; the director page
composites those shots with animated cards, callouts and captions; the renderer
steps that page frame by frame and hands the frames to ffmpeg.

```bash
cd video
npm install
node capture.mjs     # drive the live UI, screenshot it, measure the elements
node captions.mjs    # emit .srt / .vtt, assert the submission rules
node preview.mjs     # one frame per beat — fast check before a full render
node render.mjs      # step the timeline frame by frame and encode it
node verify.mjs      # confirm it is not blank — and that it does not stall
```

**Nothing is captured in real time**, and that is the whole reason it is smooth.
The first version of this pipeline used Chromium's own recorder, which
screencasts at whatever rate the page happens to paint — and a 90px-blur aurora
over a 1920x1080 stage does not paint at a steady 60Hz on any machine. When a
frame was late the recorder repeated the previous one, so frame timing came out
of the compositor's back pressure rather than the timeline. That is judder, and
it was visible.

`render.mjs` asks for each frame by number instead: `__renderFrame(f / fps)`,
screenshot, next. A machine that takes 40ms per frame and one that takes 400ms
put the same picture at the same timestamp; how long a frame took to draw no
longer has any way to influence when it is shown, so no frame can be dropped,
doubled or unevenly spaced. `verify.mjs` proves it by decoding every frame and counting how
many are near-identical to their predecessor — on a timeline in continuous
motion, a repeated frame can only be a stall.

Three things it took measuring to get right, all of them on the render path:

- **Use the full Chromium build, not Playwright's headless shell.** Identical
  pixels, but the shell's screenshot path measured 600ms/frame against 147ms.
- **Do not wait for animation frames before capturing.** CDP's
  `captureScreenshot` forces its own commit, so frames taken with and without a
  double-rAF settle are byte-identical — and the wait cost ~68ms/frame, over
  half an hour across a full render.
- **Split parallel work at beat boundaries, never mid-beat.** Every animated
  value is a pure function of time, verified by diffing the DOM state of a page
  that played into a moment against one that jumped straight to it. What is
  *not* a pure function of time is Chromium's choice of image resampler: once it
  decides an element is animating it switches to a cheaper filter, so a page
  that jumped in cold rasterises a scaled screenshot slightly differently. Beat
  boundaries are the one place that cannot show, because the scene's opacity is
  zero there.

Two things are asserted rather than trusted, because both fail silently: the
first caption must name the hackathon, and the timeline must be **under** two
minutes. `captions.mjs` exits non-zero otherwise. (It caught the timeline
landing at exactly 120.0s, which would not have qualified.)

Nothing on screen is hand-placed or hand-typed:

- **Callout positions** — `capture.mjs` measures the real bounding box of each
  annotated element and writes it to `capture/capture.json` as fractions of the
  image; the director pans the shot until that box lands in frame. Hand-placed
  coordinates drifted the moment any panel changed height.
- **The hashes in the derivation diagram** — also scraped off the running app by
  `capture.mjs`. The commitment and nullifier that scramble into place in the
  animation are the ones the circuits actually produced for the handle in the
  footage. Typing plausible-looking hex into the timeline would have been easier
  and would have been a lie.

Every animated value is a pure function of one time argument: `__seek(t)` fully
determines the frame. There are no CSS animations or transitions on anything
that moves, so the render cannot depend on wall-clock timing or machine speed.
Per-frame work is confined to `transform`, `opacity` and `width`, which
composite without a full-page repaint.

## What is public and what is never public

| | |
|---|---|
| **Public, permanently, to anyone** | 32-byte commitments · a count for each · 32-byte nullifiers · a match flag · the sealed threshold |
| **Never public, at any point, to anyone** | The payment handle · the amount lost · the reporter's identity, wallet or secret · which nullifiers belong to the same person · how many handles one person reported · the narrative of what happened |

An observer with a full copy of the chain and unlimited compute learns that *some*
handle received three reports. They do not learn which handle, from whom, or for how
much.

## Known limitations

These are real and they are not softened. A judge who finds an unnamed hole discounts
everything else.

**The commitment space is grindable.** A payment handle is not high-entropy. An
attacker who enumerates plausible UPI IDs and derives their commitments can discover
which handles carry reports. What Chorus protects perfectly is the *reporter*; what it
protects imperfectly is the *target*. The production fix is a distributed pepper or
threshold decryption held by parties who must cooperate to grind, plus rate-limited
derivation. This build ships domain-separated commitments and names the gap.

**Reports are unverified.** The circuit proves the derivation was correct, not that a
scam occurred. Three colluding accounts can flag an innocent handle. The threshold
raises the cost and the absence of any readable list limits the payoff — you cannot
smear a merchant on a register nobody can read — but the design does not claim to
establish truth. It establishes independent coincidence, which is a weaker and more
honest claim. The production fix is to raise the cost of a report (stake, attestation,
or a rate-limiting nullifier per reporter per period) rather than to adjudicate it.

**One bit is not a case.** Knowing three people were hit does not recover anyone's
money. It changes what those three do next, and what the fourth person does before
paying.

**Normalisation is a one-way door.** The commitment is a hash of the *normalised*
handle, so changing `normaliseHandle` after any reports exist orphans every existing
commitment. It is deliberately conservative — NFKC, strip whitespace, lowercase, and
nothing else — because collapsing `a.b@upi` into `ab@upi` would land one merchant's
reports on another's commitment.

**The demo wallet pays for every report.** See "How the pieces talk" above.

## Known setup gotchas

**Docker Desktop's WSL integration conflicts with a native Docker install.** This project
runs Docker CE natively inside the WSL distro under systemd. If Docker Desktop's
*Settings → Resources → WSL integration* is also enabled for the same distro, its proxy
overwrites `/var/run/docker.sock` and fails with
`DockerDesktop/Wsl/ExecError ... failed to read component versions`. Leave that toggle
**off** — nothing here needs it. Recovery:

```bash
sudo systemctl stop docker.socket docker.service
sudo rm -f /var/run/docker.sock
sudo systemctl start docker.service
```

**npm 11 blocks postinstall scripts by default.** Installs emit `npm warn allow-scripts` for
`ssh2`, `protobufjs`, and `node-gyp-build-optional-packages`. This did not break
testcontainers here, but `npm approve-scripts --allow-scripts-pending` is the escape hatch.

**`compact --version` on Windows is a false positive.** It resolves to Windows' built-in
`compact.exe` (NTFS folder compression) and prints a compression report. Verify inside WSL.

**The faucet is captcha-gated.** Cloudflare Turnstile. No CI or scripted funding.

**`Application is not authorized` in the browser UI** means the Lace extension has not
authorized the page's origin. The UI also cannot do anything useful until a contract is
deployed — the CLI is the path that produces the first on-chain transaction.
