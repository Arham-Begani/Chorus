# CLAUDE.md — Chorus

Read `idea.md` for the concept. This file is how it gets built. Follow it literally.

---

## Hard context

- **Hackathon:** Brainwave 2026 Midnight Track (Devpost). **Submission closes 11:45pm IST today.**
- **Qualification is binary:** a contract must be **deployed to Midnight Preview or PreProd testnet**. A contract that compiles but is not deployed does not qualify for the track, regardless of how good the UI is.
- **Required artifacts:** public repo, working demo, README with setup instructions, demo video that says the hackathon name in the first sentence.
- **Judging weights:** Innovation 25 · Technical 25 · Impact 20 · UX 15 · Scalability 10 · Presentation 5.
- Solo builder. Assume ~8 working hours, not more.

## Operating rules

1. **Deploy before you build.** The first milestone is an unmodified scaffold contract deployed to testnet with a confirmed transaction. Nothing else starts until that is green.
2. **Nothing on the demo path is mocked.** The contract call, the proof, the transaction, the ledger read: all real. Styling, copy, and empty states can be crude.
3. **No scope additions.** If it is not in "In scope" below, it does not get built, even if it is five minutes of work. Especially not: accounts, login, evidence upload, report history, notifications, chat between matched reporters, mobile responsiveness, dark-mode toggle, landing page.
4. **Do not invent Compact syntax.** Every ledger-ADT method and stdlib call gets verified against the local scaffold's generated `index.d.ts` or the docs before use. If a method name is uncertain, compile a two-line probe contract to find out. Guessing here burns hours.
5. **Ask before rewriting.** If something in this file turns out to be wrong about the toolchain, say so and propose the change. Do not silently redesign the contract.
6. **Commit after every green milestone**, with the milestone name as the message. A working commit is a fallback submission.

## Stop conditions

- **T+2h, scaffold not deployed to testnet:** stop and report. Do not proceed to the real contract. The fallback is to submit whatever is deployed with an honest README.
- **T-3h, `report` circuit not working end-to-end on testnet:** freeze the contract, ship the UI against whatever is deployed, write the README, record the video. A smaller working thing submitted beats a bigger thing that misses the deadline.
- **T-90m:** hard freeze. No more code. Video and Devpost writeup only.

---

## Milestones

**M0 — Toolchain and testnet (target: 2h, and this is the whole risk)**
Install the Compact toolchain, Lace wallet (Midnight beta), Node 24+, and run the proof server in Docker. Get tDUST from the faucet. Take the official scaffold or bboard example **unmodified**, compile it, deploy to Preview, and confirm one transaction. Record the exact working versions in `README.md` as you go: `compact` compiler version, `pragma language_version`, Node version, proof server image tag, network ID. Version drift is the single most likely thing to eat the night.

**M1 — Contract compiles.** Chorus contract as specified below, `compact compile` clean, circuit row counts noted.

**M2 — Contract deployed.** Chorus deployed to Preview. Contract address written into the frontend config and into the README.

**M3 — `report` works from a CLI or script.** One report call, transaction confirmed, ledger state read back showing count = 1. This is the point where the project exists.

**M4 — Nullifier rejection works.** Same wallet, same handle, second call rejected. Verify it fails at the contract, not in UI validation.

**M5 — Threshold flips.** Three distinct secret keys, same handle, third call sets the match flag.

**M6 — UI.** Report screen, Check screen, ledger panel. Three windows can run side by side.

**M7 — Submission.** README, video, Devpost writeup.

---

## Contract

One file, `contract/src/chorus.compact`. Two circuits maximum.

### State design

```
export ledger reportCount:    Map<Bytes<32>, Uint<64>>;   // commitment -> count
export ledger seenNullifiers: Set<Bytes<32>>;             // spent nullifiers
export ledger matched:        Set<Bytes<32>>;             // commitments at/over threshold
export ledger totalReports:   Counter;                    // global, for the ledger panel
export sealed ledger threshold: Uint<64>;                 // set once, in constructor
```

`threshold` is `sealed` so it cannot be changed after deployment — say this out loud in the demo, it is a real trust property and it costs one keyword.

### Derivations

Both are domain-separated `persistentHash` over a `Vector` of `Bytes<32>`, following the bboard `publicKey` pattern:

```
handleCommitment = persistentHash([pad(32, "chorus:handle:v1"), handleBytes])
reportNullifier  = persistentHash([pad(32, "chorus:nullifier:v1"), handleBytes, sk])
```

`handleBytes` is the client-side SHA-256 of the **normalised** handle. Normalisation must be identical on every client or matching silently fails: trim, lowercase, strip spaces. Put the normaliser in one exported function and use it in both Report and Check. This function is the single point of failure for the whole product — if two victims normalise differently, they never match. Write a test for it.

### `report` circuit

Takes `handleBytes: Bytes<32>` as a private parameter. Calls the `localSecretKey()` witness. Then:

1. Derive commitment and nullifier; wrap **only these two** in `disclose()`.
2. `assert` the nullifier is not already in `seenNullifiers` — message: `"already reported this handle"`.
3. Insert the nullifier.
4. If the commitment is not a member of `reportCount`, insert it with a default; then look up, add one, insert back.
5. `totalReports.increment(1)`.
6. If the new count is at or above `threshold`, insert the commitment into `matched`.

Nothing else is disclosed. If the compiler raises a disclosure error, that is the compiler doing its job — do not paper over it by disclosing more. Fix the dataflow.

### `check` — do not build a circuit for this

Checking is a client-side hash plus a public ledger read. No circuit, no transaction, no proof. If you find yourself writing a `check` circuit, stop: the fact that checking is free and leaves no trace is a *feature of the pitch*, and turning it into a transaction destroys it.

### Witness

`witness localSecretKey(): Bytes<32>;` implemented in TypeScript exactly as in the bboard tutorial, backed by private state. For the demo, three distinct secret keys must be selectable so one browser can act as three unlinkable reporters — a dropdown labelled "Reporter A / B / C" is fine and honest, because they are genuinely separate keys producing genuinely separate nullifiers. Do not fake this by incrementing a counter.

### Contract-level tests (write these, they are fast and they are also the technical-depth story)

- Same handle, different secret keys → different nullifiers, same commitment.
- Same handle, same key, twice → second call rejected.
- Different handles → independent counts.
- Normalisation: `"  Scammer@UPI "` and `"scammer@upi"` produce the same commitment.
- The handle bytes and secret key appear nowhere in the resulting public ledger state.

That last one is the test to show a judge.

---

## Frontend

Vite + React + TypeScript. Minimal, dark, monospace, no component library. Three regions on one page — no routing.

**Report.** One text input, one "Reporter A/B/C" selector, one submit button. States: idle → deriving → proving → submitted → matched / rejected. Show the derived commitment and nullifier as hex, truncated, before submitting — the user seeing that the handle became an opaque hash *before* it leaves the browser is a large part of the pitch.

**Check.** One text input. On keystroke (debounced) derive the commitment locally and read the ledger. Three outcomes: no reports · reported, below threshold · **matched**. Label this region "no transaction, no server request" in the UI itself.

**Ledger panel.** Live public state: `totalReports`, the commitment→count map as raw hex rows, nullifier count, threshold. This panel exists to be pointed at during the demo: it must be visually obvious that it contains nothing but hashes. Do not prettify it, do not add human-readable labels, do not resolve commitments back to handles even if you have them in local state. The ugliness is the argument.

Contract address, network ID, and proof server URL go in one config file, not scattered.

---

## Demo (record it last, script it first)

Three browser windows, side by side, three different reporter keys. Ledger panel visible in all three.

1. Window A reports a handle. Point at the ledger panel: one commitment, count 1, and no handle anywhere.
2. Window B reports the same handle, typed fresh, not copy-pasted. Count 2. Still nothing legible.
3. Window C reports it. **All three windows flip to matched at once.** Say the line: three strangers who cannot identify each other just learned they were hit by the same operator, and the handle was never on the chain.
4. Window C reports the same handle again. Rejected by the contract. Say: the count cannot be inflated, and the chain still does not know who they are.
5. Check screen: paste the handle → matched, instantly, no transaction. Then paste a different handle → clean. Say: this is what a person about to pay would do, and it left no record that they asked.

Open with "this is my demo for Brainwave 2026 Midnight Track" as the literal first sentence. Under two minutes.

---

## README requirements

Setup that a judge can actually follow: exact versions, proof server command, faucet link, compile command, deploy command, `.env` template, run command. Deployed contract address and network. A short "what is public and what is never public" table. And an explicit **Known limitations** section that names the grindable-commitment weakness and the unverified-report weakness in plain language, with the production fix for each. Do not soften these — naming them is worth more than hiding them, and a judge who finds an unnamed hole discounts everything else.

## In scope

Contract with `report`, nullifier prevention, threshold flag, sealed threshold. Client-side commitment derivation and normalisation. Report screen, Check screen, raw ledger panel. Three switchable reporter keys. Contract tests. README. Video.

## Out of scope

Everything else. Including, specifically: accounts, auth, evidence upload, amounts, report history, victim-to-victim messaging, notifications, moderation, dispute or appeal flow, police or portal integration, multi-domain registers (the generalisation is a *sentence in the pitch*, not a feature), mobile layout, analytics, deployment to a hosted URL if it costs more than ten minutes.
