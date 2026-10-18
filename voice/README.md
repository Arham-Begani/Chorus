# CHORUS — voice mission control

One spoken goal, several coordinated conversations, one accountable plan. This application is self-contained in `voice/`. The existing Midnight project elsewhere in this repository is preserved.

**Delivery mode: working simulation, real-call setup prepared.** The user selected simulation-ready delivery on 2026-10-18. No real browser voice session, outbound phone call, provider concurrency test or spoken live revision has been performed. Live calling stays disabled by default. See [CAPABILITIES.md](CAPABILITIES.md) and [VERIFICATION.md](VERIFICATION.md).

## Run locally

Install Node **24.12+** (tested with 24.19.0). Run these commands from `voice/`, not the repository root. This subproject deliberately does not alter the original npm workspaces.

```sh
cd voice
npm ci
npm run setup
```

Setup creates an ignored `.env` with a random local password and session secret. Existing `.env` files are preserved. Use its **DEMO_PASSWORD** at sign-in; do not commit or paste it into chat.

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

Open **http://localhost:3000**. Sign in, create an Event relocation mission, review the budget/deadline/contacts, and authorize simulated research. Watch the setup conflict, earlier-access investigation and evidence log. Use Revise goal to lower the additional budget to INR 9,000; authorize research for the new revision and review the recalculated plan. Approving a plan records preference and performs no purchase, reservation or cancellation.

Simulation agents use configurable business offers and the same durable engine/tool events as real agents. To change responses, pause, open Business responses and edit a business's JSON terms. Prices are integer paise; times are ISO instants with an offset. `[]` means the business declines. Empty responses or impossible terms produce a blocked plan. Resume after editing. A second mission type covers equipment rental plus delivery and setup.

Keyboard: **N** opens a new mission; Escape closes dialogs. Dialog focus is trapped and restored. Mobile has a plus control in the header. Reduced-motion preferences disable graph-edge animation.

## Verify

```sh
npm run typecheck
npm test
npm run test:integration    # migrated PostgreSQL; stop any running worker first
npm run build
npx playwright install chromium
npm run test:e2e           # web + worker must be running, .env configured
```

The integration suite launches and stops its own worker to prove recovery across process replacement. Stop your development worker before running it. Database test records are scoped to unique test owners and cleaned afterwards. Browser tests create persisted missions in the local simulation account. The e2e suite uses desktop Chromium and mobile emulation. See [VERIFICATION.md](VERIFICATION.md) for measured results, limits and reproduction details.

Production web runs with `npm start`; production worker with `node --import tsx worker/index.ts`. Runtime environment can supply secrets without an `.env` file. Docker web/worker/migration targets, private PostgreSQL and CI are included. Read [DEPLOYMENT.md](DEPLOYMENT.md) before deployment.

## Live integration

Read [integrations/BOLNA_SETUP.md](integrations/BOLNA_SETUP.md). It includes the first browser/backend proof, one authorized outbound structured-fact proof, and the three-call rehearsal. Prompts and generated role-specific tool definitions are included; regenerate placeholder schemas with `npm run bolna:tools`.

Required outside this repository: Bolna API key and two agent ids, verified account concurrency/duration/pricing/retry settings, public HTTPS callbacks, Supabase credentials/account, independently generated callback/tool secrets, explicitly authorized participants in the server allowlist, a calling window and a separate approved call-cost budget. **Do not enable real mode merely to explore the UI.** Local auth is simulation-only. The real call path needs Supabase-authenticated ownership, allowlisted contacts and an approval card.

## Architecture and boundaries

- Browser → authenticated Next.js API → PostgreSQL aggregate, entity projections and event ledger. No browser-local authoritative mission state.
- Dedicated pg-boss worker reserves attempts before dialing. A crash/timeout at the dial boundary produces uncertainty, never an automatic duplicate call. Refresh and worker restart preserve mission progress.
- Agent capability binds to mission/task/attempt/role. Phone callers cannot grant permissions. Current revision and a freshly read evidence set are required before submitting offers.
- Deterministic arithmetic, capacity, readiness/setup, confirmation and approval checks decide feasibility. Missing evidence remains a blocker. Prior offers are preserved as stale evidence.
- Pause blocks new dispatch admission and plan approvals. A network request already admitted or an active provider call may finish. Only documented queued cancellation is attempted.
- No fabricated audio, transcript, monitoring or completed action. Provider artifacts appear only when returned by a real completed execution.

Current limitations: live paths are implemented but unverified with an account; no automatic business directory/contact discovery (the mission proposes editable role contacts); two supported mission templates; no general-purpose LLM planning outside configured Bolna agents; no binding commitments; no active-call termination guarantee; conservative telephony reserves require manual adjustment; Supabase access-token expiry requires sign-in again; deployment and real hosting costs/accounts remain operator-owned. The simulation supplies an AI voice integration's tool behavior, not artificial voice audio.

Documentation: [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), [TASKS.md](TASKS.md), [CAPABILITIES.md](CAPABILITIES.md), [DEMO.md](DEMO.md), [SESSION.md](SESSION.md). Official stack references: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [pg-boss](https://github.com/timgit/pg-boss), [Supabase Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [native PostgreSQL helper](https://github.com/leinelissen/embedded-postgres).
