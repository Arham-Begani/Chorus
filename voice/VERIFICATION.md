# Verification record

Date: 2026-10-18. Native Windows, Node 24.19.0, PostgreSQL 17.6. Dependencies are exact versions in package-lock.json; Next.js 16.4.2, React 19.3.1, pg-boss 12.38.0, Bolna Web Call SDK 3.0.1. The native PostgreSQL 18 package crashed during initialization; the dev helper was pinned to 17.6, which initialized and ran successfully. No system virtualization settings were changed.

## Executed locally

| Check                          | Measured result                                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm install / dependency audit | 0 known vulnerabilities reported                                                                                                                                                                                                       |
| npm run typecheck              | Passed                                                                                                                                                                                                                                 |
| npm test                       | 31 tests passed                                                                                                                                                                                                                        |
| npm run db:migrate             | Migrations 001 and 002 applied to real PostgreSQL                                                                                                                                                                                      |
| npm run test:integration       | 7 tests passed against PostgreSQL                                                                                                                                                                                                      |
| npm run build                  | Optimized Next.js production build passed                                                                                                                                                                                              |
| Desktop/mobile browser tests   | 4 tests passed against the optimized production build: desktop Chromium (1600×1100) and mobile Chromium emulating iPhone 13 (390px), including lifecycle, revision, evidence, approval, refresh, graph visibility and authentication.  |
| Render inspection              | Desktop 1600px and mobile 390px inspected; graph visibility and mobile viewport rendering confirmed; full-page mobile screenshots can omit Chromium composited graph layers when scrolled away, so graph crops are captured separately |

Covered behaviors: one task's evidence changes another's brief; setup timing conflict; capacity and missing terms; integer minor-unit budget arithmetic; INR 9,000 revision and stale proposals; stale revision/evidence rejected; phone permission escalation rejected; cross-mission/task capabilities rejected; ended/expired capabilities rejected; duplicate tools/callbacks; out-of-order terminal status; uncertain dispatch never redialed automatically; contact allowlist; refused and declined offers; pause; three simulated concurrent attempts; fresh database connection; new worker process resumes the same attempts; multiple workers cannot reserve the same task; equipment/delivery readiness checks; authenticated browser refresh, revision, plan approval and evidence drawer.

Integration tests use real PostgreSQL and the same coordinator. Provider HTTP tests use explicit test doubles and assert documented URL/auth/error handling; those are not actual Bolna calls. Browser tests use explicit simulation mode, not a fake live transcript. Test data lives in the local development database; unique integration owners are cleaned afterwards.

## Live verification

**No live calls tested.** On 2026-10-18 the user chose “Deliver simulation-ready; document live setup.” Bolna key, agent ids, Supabase account configuration, public HTTPS callback, authorized test participants and test call-cost allowance were not supplied. Browser conversation invoking backend, outbound structured-fact reporting, real three-call concurrency and spoken revisions remain unverified. CAPABILITIES.md distinguishes documented contracts from measured integration results.

## Deployment verification

Docker build/run cannot be verified on this host: Docker is absent and WSL cannot start because virtualization is disabled. Compose, Docker targets, migration startup ordering and GitHub Actions checks are prepared. A production-like local optimized Next.js server and separate worker are used for final browser verification. Public hosting was not provisioned and no paid resource was created.

Final rehearsal additionally found and fixed a revision/hangup race: an active simulated attempt now refreshes and submits under a revision-specific idempotency key before ending. A regression test covers this timing.

Accessibility contrast measured against the elevated surface: primary text 13.75:1, secondary 6.77:1, tertiary 4.89:1. Essential input/control borders were raised to 3.64:1. Next standalone packaging strips local .env files after build; Docker also excludes them from its build context.
