# Setup

Chorus is a public register of scam reports that nobody can read. This document gets it
running on your machine.

There are two paths. **Path A needs nothing** — no wallet, no testnet funds, no Docker, no
Compact compiler — and exercises the real compiled circuits in about ten minutes. **Path B**
is the full testnet path and requires solving a captcha by hand.

If you are evaluating this project, take Path A.

---

## Path A — run it now (~10 minutes)

```bash
git clone https://github.com/Arham-Begani/Chorus.git ~/chorus
cd ~/chorus
npm install
npm run build
```

Then two terminals:

```bash
# terminal 1 — the reporter agent, in local simulation mode
CHORUS_NETWORK=local npm run agent --workspace @chorus/cli

# terminal 2 — the UI
npm run dev --workspace @chorus/ui
```

Open <http://localhost:5173>.

**Start the agent before the UI.** The agent writes `ui/public/deployment.json` on startup,
and the UI refuses to load without it — that file is how the frontend learns which register
to read, so redeploying never requires a rebuild.

### Why this needs nothing installed

`contract/src/managed/` is committed to the repository — the generated contract API, the
compiled zkir, and the 5.2MB proving key. The Compact toolchain publishes only macOS and
Linux-musl builds and has no Windows binary at all, so shipping the compiler output is what
lets you run this without it. `npm run build` is a plain TypeScript compile; it never invokes
`compact`.

Local simulation mode then runs those compiled circuits **in process** — no proof server, no
chain, no wallet, so nothing needs Docker and nothing needs funding.

### What is real in Path A, and what is not

Be precise about this. The distinction matters more than the demo.

| Real | Not real |
|---|---|
| The compiled Compact circuits | The zero-knowledge proof |
| Commitment and nullifier derivation | The transaction and its fee |
| Duplicate rejection — the contract's own `assert` refuses it | The chain; state is in memory and dies with the process |
| The threshold flip at three reports | |
| Handle normalisation | |

The agent returns `simulated: true` from `GET /api/status`, the UI renders a **SIMULATED
MODE** banner, and the ledger panel shows `network: local`. Nothing produced in this mode
should ever be presented as testnet output.

### Try it

1. **Report** a handle — say `scammer@upi` — as reporter 1. The count goes to 1.
2. Report the *same* handle as reporter 1 again. It is rejected: one reporter, one report,
   per handle. That rejection is the contract's own `assert`, not a UI check.
3. Report it as reporters 2 and 3. At the third the commitment flips to **matched**.
4. **Check** a handle you never reported. Nothing. Check `scammer@upi`. Three reports.
5. Open the raw ledger panel. Every value is a 32-byte hash. There is no handle anywhere.

Point 5 is the product. The register is public and unreadable at the same time.

### Verify the agent directly

```bash
curl -s http://127.0.0.1:3001/api/status     # {"simulated":true,...}
curl -s http://127.0.0.1:3001/api/ledger     # commitment -> count rows, all opaque
```

Routes: `GET /api/status`, `GET /api/ledger`, `POST /api/check`, `POST /api/derive`,
`POST /api/report`. The agent binds to `127.0.0.1` only.

---

## Prerequisites

| | Path A | Path B |
|---|---|---|
| Node.js **24.11.1+** | required | required |
| Docker | — | required (proof server) |
| Compact toolchain | — | required |
| Testnet funds | — | required (captcha by hand) |
| WSL2, if on Windows | recommended | **required** |

Node 24 is not optional despite the Midnight docs saying "22+" — the template pins
`"engines": { "node": ">=24.11.1" }` and the install fails below it.

On macOS or Linux, Path A needs only Node. On Windows, use WSL2 (Ubuntu): the Midnight
toolchain has no native Windows support, and while Path A avoids the compiler, WSL2 is the
only configuration this project has been verified in.

### Verified environment

Every version below was observed on the build machine, not copied from documentation.

| Component | Version |
|---|---|
| WSL | 2.7.11.0 (kernel 6.18.33.2-2) |
| Distro | Ubuntu 24.04.4 LTS (x86_64) |
| Node.js | v24.19.0 |
| npm | 11.17.0 |
| `compact` (toolchain manager) | 0.5.1 |
| `compactc` (compiler) | 0.31.1 |
| `pragma language_version` | 0.23 |
| Docker Engine | 29.7.2 |
| Proof server image | `midnightntwrk/proof-server:8.0.3` |

`compact` and `compactc` carry **separate version numbers**, and the docs and the artifacts
disagree in two places: the install page names proof server `8.1.0` while the scaffold
actually launches `8.0.3`, and the docs say Node 22 while the template pins 24. Both
discrepancies are real and both cost time.

---

## Path B — the full testnet path

### 1. Install the Compact toolchain (inside WSL, if on Windows)

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source "$HOME/.local/bin/env"
compact update      # without this, `compact compile` fails with "No default compiler set"
```

Verify **inside WSL**. On Windows, `compact --version` resolves to the built-in `compact.exe`
— NTFS folder compression — and prints a disk compression report. It is a false positive that
looks exactly like success.

### 2. Build and prove the contract

```bash
npm install
npm run test --workspace @chorus/contract   # 11/11 must pass
npm run build
```

To recompile the Compact source from scratch rather than trusting the committed artifacts:

```bash
npm run compact --workspace @chorus/contract     # -> Compiling 1 circuit: exit 0
```

### 3. Deploy — a human has to do this step

```bash
npm run deploy:preview          # or deploy:preprod
```

The CLI generates its own wallet, so **no Lace extension is needed on this path**. It prints
an unshielded `mn_addr_preview1...` address and blocks on `Waiting to receive tokens...`
indefinitely, with no timeout.

Paste that address into <https://midnight-tmnight-preview.nethermind.dev/>, solve the
**Cloudflare Turnstile captcha**, and request tokens. The captcha is why this cannot be
scripted or run in CI. The faucet dispenses tNIGHT, which the CLI then registers for tDUST
generation automatically.

Once funded, choose **1** to deploy. The address is written to `deployment/preview.json` and
copied to `ui/public/deployment.json`.

Reuse a funded wallet on later runs and skip the captcha entirely:

```bash
export CHORUS_WALLET_SEED=<64 hex chars>
```

### 4. Run it

```bash
CHORUS_NETWORK=preview npm run agent --workspace @chorus/cli   # terminal 1
npm run dev --workspace @chorus/ui                             # terminal 2
```

Or skip the browser: option **5** in the CLI's main menu runs report, duplicate rejection and
the threshold flip back to back and prints a result you can verify against the public indexer.

### 5. Verify on chain, without trusting the CLI

```bash
curl -s -X POST https://indexer.preview.midnight.network/api/v4/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{contractAction(address:\"<ADDRESS>\"){__typename address transaction{hash ... on RegularTransaction{transactionResult{status}} block{height}}}}"}'
```

Faucet transactions are queried by `identifier`, **not** by `hash` — `offset:{hash:...}`
fails with `invalid transaction hash: cannot convert to ByteArray<32>`.

---

## Two warnings that will ruin a live demo

**Wallet sync is the slowest part of the entire system.** Before anything touches the chain,
three sub-wallets must sync, and the dust wallet is roughly **30× slower** than the shielded
one. Measured on PreProd (~2.16M blocks):

| wallet | items | rate | time |
|---|---|---|---|
| unshielded | 563,587 | instant | seconds |
| shielded | 1,441,741 | ~3,100/s | ~8 min |
| **dust** | **1,441,980** | **~60–104/s** | **~3.5–6 hr** |

It is not skippable — `generateDust()` opens with `await walletFacade.dust.waitForSyncedState()`.
There is no persistence: the CLI uses in-memory transaction history, so every restart rescans
from zero. **Keep one session alive rather than restarting it.**

Sync time scales with chain history, so **prefer Preview over PreProd**: Preview (~472K
blocks) does in minutes what PreProd needs hours for.

At the default log level the CLI prints nothing while syncing and looks hung. Use:

```bash
DEBUG_LEVEL=debug npm run deploy:preview
```

**The faucet is a single point of failure.** Preview's faucet returned HTTP 503 for hours
during development, and the testkit health-checks it at startup — so the CLI aborts with
`Request failed with status code 503` before reaching any prompt, even when the chain and the
indexer are both perfectly healthy.

---

## Verifying the privacy claim

```bash
npm run test --workspace @chorus/contract
```

11 tests. The one worth reading is the last: after three reports of the same handle, it
asserts that neither the hashed handle, nor the raw handle string, nor any reporter's secret
key appears anywhere in public ledger state, and that every public value is exactly 32 bytes.

The full package pipeline — `compact → typecheck → lint → build → test` — runs as:

```bash
npm run ci --workspace @chorus/contract
```

| | |
|---|---|
| **Public, permanently, to anyone** | 32-byte commitments · a count for each · 32-byte nullifiers · a match flag · the sealed threshold |
| **Never public, at any point, to anyone** | The payment handle · the amount lost · the reporter's identity, wallet or secret · which nullifiers belong to the same person · how many handles one person reported · what happened |

An observer with a full copy of the chain and unlimited compute learns that *some* handle
received three reports. They do not learn which handle, from whom, or for how much.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `No deployment.json — deploy the contract first` in the browser | The UI loaded before the agent wrote the record. Start the agent first, then reload. |
| `CHORUS_WALLET_SEED must be set` | The agent is non-interactive by design and will not prompt. Export a 64-hex seed, or use `CHORUS_NETWORK=local`, which needs no wallet. |
| `compact --version` prints a disk compression report | You are on Windows and hit the built-in `compact.exe`. Run inside WSL. |
| `compact compile` → `No default compiler set` | You skipped `compact update` after installing the toolchain manager. |
| `persistentHash` will not compile | The vector type and arity are both required: `persistentHash<Vector<2, Bytes<32>>>([...])`. |
| `Request failed with status code 503` before any prompt | The faucet is down. The testkit health-checks it at startup and aborts. Wait, or switch networks. |
| CLI appears hung for hours with no output | It is syncing. Set `DEBUG_LEVEL=debug`. See the sync table above. |
| `DockerDesktop/Wsl/ExecError ... failed to read component versions` | Docker Desktop's WSL integration is fighting a native Docker CE install for `/var/run/docker.sock`. Turn that toggle **off** — nothing here needs it. Then: `sudo systemctl stop docker.socket docker.service && sudo rm -f /var/run/docker.sock && sudo systemctl start docker.service` |
| `npm warn allow-scripts` during install | npm 11 blocks postinstall scripts by default. Harmless here; the escape hatch is `npm approve-scripts --allow-scripts-pending`. |
| `Application is not authorized` in the browser | The Lace extension has not authorized the page's origin. Only affects the wallet path; the CLI path does not need Lace. |
| Two victims of the same handle never match | Normalisation drift. Both clients must normalise identically — see `contract/src/normalise.ts`. This failure mode is silent by design of the system, which is why it is tested directly. |

### A note on `sync.sh` and `.install.sh`

Both are author-workflow scripts with a hardcoded `/mnt/d/GitHub/Chorus` source path. They
exist because `npm install` into `/mnt/d` over 9p took 45+ minutes and three killed runs
versus 8 minutes on native ext4, so the Windows copy stays the editable source of truth and
`~/chorus` is a disposable build mirror.

**If you cloned this repository, you do not need either script.** Clone directly into the
Linux filesystem and install there.

The `run-*.sh` helpers also `cd "$HOME/chorus"`, so they work verbatim only if you cloned to
that path. The `npm run` commands in this document are path-independent; prefer them.

---

## Repository map

| Package | What it is |
|---|---|
| `contract/` | The Compact contract, its witnesses, the normaliser, the simulator, and 11 tests. |
| `api/` | `ChorusAPI` (deploy, join, report) and — separately — `api/read.ts`, the half that cannot write. |
| `cli/` | The interactive driver, plus the reporter agent the UI talks to. |
| `ui/` | Vite + React. Report, Check, and the raw ledger panel. |
| `video/` | Records the demo: captures the real UI, composites motion graphics, emits captions. |
| `deployment/` | One JSON record per network. Created by the agent or a deploy; how anything finds the contract. |

### How the pieces talk

```
REPORT   browser ──▶ reporter agent (127.0.0.1) ──▶ proof server ──▶ testnet
         handle normalised + SHA-256'd in the browser;
         only the 32 hashed bytes cross to the agent;
         only commitment + nullifier reach the chain

CHECK    browser ──▶ public indexer
         the agent is not involved and need not be running
```

The split between `api/index.ts` and `api/read.ts` is load-bearing. `read.ts` imports nothing
that needs a wallet, a proof server, or private state, so the browser bundle **physically
cannot submit a transaction**. That is what makes "checking involves no transaction" a
structural property of the build rather than a claim in a paragraph.

**What the agent is, stated plainly.** Reporting needs a funded wallet, a proof server and
the ability to sign; in production that is the Lace extension's job. In this build it is a
local process holding the demo wallet and the three reporter secret keys, bound to loopback.
All three reporters are funded from one testnet wallet, because the faucet is captcha-gated
and three wallets would mean three captchas — that is visible on chain as one payer. What is
*not* staged: the three reporter secret keys are independently random, so the three nullifiers
are genuinely unlinkable.

---

## Current status

| Milestone | State |
|---|---|
| M0 — verified environment, scaffold deployed to PreProd | ✅ |
| M1 — the Chorus contract, 11/11 tests | ✅ |
| M2 — Chorus contract deployed to testnet | ⛔ blocked on faucet funding |
| M3–M5 — report, duplicate rejection, threshold flip **on chain** | ⛔ blocked by M2 |
| M6 — API, CLI, agent and UI end to end against the compiled circuits | ✅ |
| M7 — demo video | ✅ |

The blocker is funding, not code: the Preview faucet sits behind a Cloudflare Turnstile that
cannot be scripted. Report, duplicate rejection and the threshold flip are all demonstrated
against the compiled contract in local simulation mode — see the Path A table above for
exactly what that does and does not prove.

## Known limitations

These are real and they are not softened.

**The commitment space is grindable.** A payment handle is not high-entropy. An attacker who
enumerates plausible UPI IDs and derives their commitments can discover which handles carry
reports. What Chorus protects perfectly is the *reporter*; what it protects imperfectly is the
*target*. The production fix is a distributed pepper or threshold decryption held by parties
who must cooperate to grind, plus rate-limited derivation. This build ships domain-separated
commitments and names the gap.

**Reports are unverified.** The circuit proves the derivation was correct, not that a scam
occurred. Three colluding accounts can flag an innocent handle. The threshold raises the cost
and the absence of any readable list limits the payoff — you cannot smear a merchant on a
register nobody can read — but the design does not claim to establish truth. It establishes
independent coincidence, which is a weaker and more honest claim.

**One bit is not a case.** Knowing three people were hit does not recover anyone's money. It
changes what those three do next, and what the fourth person does before paying.

**Normalisation is a one-way door.** The commitment is a hash of the *normalised* handle, so
changing `normaliseHandle` after any reports exist orphans every existing commitment.
