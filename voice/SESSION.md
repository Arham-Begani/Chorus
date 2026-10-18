# Session handoff — 2026-10-18

Repository Arham-Begani/Chorus had an unrelated Midnight project. It was cloned and preserved; the voice app is isolated under voice/ on feat/voice-mission-control. User explicitly chose simulation-ready delivery with documented live setup. No real calls are authorized or placed.

Implemented: Next.js mission control, PostgreSQL aggregate/projections/events and migrations, pg-boss process, shared coordination engine, configurable simulation, Bolna adapter/session/tool/callback contracts, scoped capabilities, approvals, revisions, pause/recovery, second equipment mission, prompts/tool schemas, local DB helper, Docker/Compose, CI, setup/deployment/demo docs. Private participant role cards are an ignored local-only deliverable.

Passed: 31 unit tests, 7 PostgreSQL integration tests including real worker process replacement, typecheck, optimized build, earlier desktop/mobile browser lifecycle runs. Final production browser run and GitHub CI status are updated before handoff in VERIFICATION.md.

Remaining integration limits: no account-backed Bolna proof; no browser voice audio in simulation; no actual three-call voice run or spoken live revisions; no public deployment. Exact live requirements are in integrations/BOLNA_SETUP.md. Docker cannot run locally; CI prepares Linux image validation.

Next concrete task after simulation handoff: if the owner elects to enable live calls, privately configure .env with accounts/secrets, deploy HTTPS web + worker + PostgreSQL, explicitly authorize a participant and call-cost budget, then execute the one-browser and one-outbound proof before concurrency testing. Do not mark those milestones complete from simulation evidence.

Final state: [PR #1](https://github.com/Arham-Begani/Chorus/pull/1) is open, the original application is preserved, and the final code passed [Linux CI](https://github.com/Arham-Begani/Chorus/actions/runs/39122791576), including both Docker image builds and all 42 automated tests. The production preview and worker are running locally at http://localhost:3000 with PostgreSQL on loopback. Sign in using the private DEMO_PASSWORD from .env. No real-call configuration is requested for this simulation delivery.
