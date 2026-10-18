# CHORUS — voice mission control

One spoken goal, several coordinated conversations, one accountable plan. This application is self-contained in `voice/`. The existing Midnight project elsewhere in this repository is preserved.

**Delivery mode: working browser conductor and coordinated simulation; real-call setup prepared.** Speak or type goals and revisions without a phone number. Operator sign-in uses email/password when Supabase is configured. No Bolna browser conversation, outbound phone call, provider concurrency test or spoken live telephone revision has been performed. Live calling stays disabled by default. See [CAPABILITIES.md](CAPABILITIES.md) and [VERIFICATION.md](VERIFICATION.md).

## Run locally

Install Node **24.12+** (tested with 24.19.0). Run these commands from `voice/`, not the repository root. This subproject deliberately does not alter the original npm workspaces.

```sh
cd voice
npm ci
npm run setup
```

Setup creates an ignored `.env` with a random local simulation password and session secret. Existing `.env` files are preserved. For a fresh local-only installation use its **DEMO_PASSWORD** at sign-in; with AUTH_MODE=supabase use your operator's email/password instead. Do not commit credentials or paste them into chat.

Start a local PostgreSQL server without Docker (development only):

```sh
# Terminal 1; keep it open. Data persists under .data/postgres.
npm run db:local
```

Or use any PostgreSQL 17 server and set DATABASE_URL in `.env`. The local helper binds to 127.0.0.1:55432 and uses development-only credentials from `.env.example`. Its native binaries are a dev dependency, not a cloud database.

```sh
# Terminal 2
npm run db:migrate
npm run dev

# Terminal 3
npm run worker
```

Open **http://localhost:3000**. Sign in and choose **Talk to conductor**. Type or use the microphone to say “Our venue cancelled. Find a venue for 40 people tomorrow at 6 pm under 12000 rupees.” Review the draft and contacts, close the conductor, and authorize simulated research. Watch the setup conflict, earlier-access investigation and evidence log. Reopen the conductor and say or type “Lower the budget to nine thousand rupees”; authorize research for the new revision and review the recalculated plan. Approving a plan records preference and performs no purchase, reservation or cancellation.

The conductor also accepts “Pause”, “Resume”, “What is blocking the plan?”, “Start research” (opens the approval step), and “Retry venue”. Create the second scenario with “Rent sound equipment and arrange delivery for 40 people tomorrow at 7 pm under 8000 rupees”. Budgets support INR, spoken numbers and `k`/`lakh`; dates support today, tomorrow, weekday or YYYY-MM-DD, with am/pm or 24-hour time. Explicit forms remain available for precise edits. Only the two supported mission templates and listed commands are interpreted; this browser controller is deterministic, not a general-purpose conversational model.

Microphone input uses the browser's SpeechRecognition implementation where available; browser permission and vendor speech-service connectivity may be required. Typed commands work in every supported browser. Recognized input and replies are saved as conductor events and restored after refresh; they are separate from business-call evidence. **Read responses aloud** optionally uses browser speech synthesis. No recorded audio or fabricated business transcript is produced. See [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

Simulation agents use configurable business offers and the same durable engine/tool events as real agents. To change responses, pause, open Business responses and edit a business's JSON terms. Prices are integer paise; times are ISO instants with an offset. `[]` means the business declines. Empty responses or impossible terms produce a blocked plan. Resume after editing. A second mission type covers equipment rental plus delivery and setup.

Keyboard: **N** opens a new mission; Escape closes dialogs. Dialog focus is trapped and restored. Mobile has a plus control in the header. Reduced-motion preferences disable graph-edge animation.

## Verify

```sh
npm run typecheck
npm test
npm run test:integration    # migrated PostgreSQL; stop any running worker first
npm run build
npx playwright install chromium
npm run test:e2e:local     # temporary loopback test web + worker; stop your worker first
# Or npm run test:e2e against an already running local-auth simulation test instance
```

The integration suite launches and stops its own worker to prove recovery across process replacement. Stop your development worker before running it. Database integration records are scoped to unique test owners and cleaned afterwards. Browser tests create persisted missions in the local simulation account. `test:e2e:local` runs a short-lived server on loopback port 3002 with random test-only credentials, disabled calls and a worker, then stops both; it never edits your `.env` or operator auth. It requires an optimized build and migrated PostgreSQL. The e2e suite uses desktop Chromium and mobile emulation. Its speech-recognition protocol double is explicitly not a hardware-microphone proof. See [VERIFICATION.md](VERIFICATION.md).

Production web runs with `npm start`; production worker with `node --import tsx worker/index.ts`. Runtime environment can supply secrets without an `.env` file. Docker web/worker/migration targets, private PostgreSQL and CI are included. Read [DEPLOYMENT.md](DEPLOYMENT.md) before deployment.

## Live integration

For an account-backed test without permanent hosting, start with [the local live-test guide](integrations/LOCAL_LIVE_TEST.md). `npm run doctor` reports missing setup without printing credentials; `npm run doctor -- --online` also checks read-only Supabase/Bolna reachability. Calling switches are never changed by diagnostics. Current Supabase publishable keys are supported; legacy anon keys remain a fallback.

Read [integrations/BOLNA_SETUP.md](integrations/BOLNA_SETUP.md). It includes the first browser/backend proof, one authorized outbound structured-fact proof, and the three-call rehearsal. Prompts and generated role-specific tool definitions are included; regenerate placeholder schemas with `npm run bolna:tools`.

Required outside this repository: Bolna API key and two agent ids, verified account concurrency/duration/pricing/retry settings, public HTTPS callbacks, Supabase credentials/account, independently generated callback/tool secrets, explicitly authorized participants in the server allowlist, a calling window and a separate approved call-cost budget. **Do not enable real mode merely to explore the UI.** Local auth is simulation-only. The real call path needs Supabase-authenticated ownership, allowlisted contacts and an approval card.

## Architecture and boundaries

- Browser → authenticated Next.js API → PostgreSQL aggregate, entity projections and event ledger. No browser-local authoritative mission state.
- Dedicated pg-boss worker reserves attempts before dialing. A crash/timeout at the dial boundary produces uncertainty, never an automatic duplicate call. Refresh and worker restart preserve mission progress.
- Agent capability binds to mission/task/attempt/role. Phone callers cannot grant permissions. Current revision and a freshly read evidence set are required before submitting offers.
- Deterministic arithmetic, capacity, readiness/setup, confirmation and approval checks decide feasibility. Missing evidence remains a blocker. Prior offers are preserved as stale evidence.
- Pause blocks new dispatch admission and plan approvals. A network request already admitted or an active provider call may finish. Only documented queued cancellation is attempted.
- No fabricated audio, transcript, monitoring or completed action. Provider artifacts appear only when returned by a real completed execution.

Current limitations: Bolna execution paths are implemented but unverified live (account and agent configuration are prepared); no automatic business directory/contact discovery (the mission proposes editable role contacts); two supported mission templates; no general-purpose LLM planning outside configured Bolna agents; no binding commitments; no active-call termination guarantee; conservative telephony reserves require manual adjustment; Supabase access-token expiry requires sign-in again; deployment and real hosting costs/accounts remain operator-owned. Browser speech support varies. The simulation supplies agent tool behavior, not artificial business-call audio.

Documentation: [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [TASKS.md](TASKS.md), [CAPABILITIES.md](CAPABILITIES.md), [DEMO.md](DEMO.md), [SESSION.md](SESSION.md). Official stack references: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [pg-boss](https://github.com/timgit/pg-boss), [Supabase Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [native PostgreSQL helper](https://github.com/leinelissen/embedded-postgres).
