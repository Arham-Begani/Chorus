# Verification record

Latest local pass, **19 October 2026**: typecheck, 52 unit tests, 10 real PostgreSQL integration tests, optimized production build and 22 desktop/mobile browser tests passed (84 total). Windows startup restored missing web/worker processes and a repeated invocation reused the same process identities. Live provider executions remain unverified and disabled. The subsequent sections preserve earlier measurements and the submission/recovery changes. Linux archive/restore, image and HTTPS results are recorded by the current GitHub CI run.

[Linux CI passed for source commit 7433531](https://github.com/Arham-Begani/Chorus/actions/runs/39162576978), including the full database archive/isolated restore with matching contents and RLS, 84 tests, production/Docker builds and Caddy/Compose HTTPS validation. Windows startup also restored a deliberately stopped worker. The local workspace was opened in the in-app browser with existing email/password sign-in; no auth settings changed. The six-slide Google pitch was exported to PDF and all slides visually reviewed after repairing missing screenshot media. Public pitch-link permission and final form submission remain owner actions, not completed claims.

Date: 2026-10-18. Native Windows, Node 24.19.0, PostgreSQL 17.6. Dependencies are exact versions in package-lock.json; Next.js 16.4.2, React 19.3.1, pg-boss 12.38.0, Bolna Web Call SDK 3.0.1. The native PostgreSQL 18 package crashed during initialization; the dev helper was pinned to 17.6, which initialized and ran successfully. No system virtualization settings were changed.

## Landing, workspace and recovery pass — latest verification

The public landing page and interactive illustrative example are separate from the authenticated /app workspace. The workspace adds next-step guidance, term/budget/check summaries, mobile navigation, mission search, sourced brief export and a fixed conductor composer. The palette uses the existing dark neutral tokens with one cyan accent; dependency edges remain distinguished by their dashed pattern. No fake customers, metrics, live audio or provider execution are presented.

Typecheck, **52 unit tests**, **9 PostgreSQL integration tests** and the optimized build passed. **All 22 desktop/mobile browser tests passed**. Expanded browser checks cover the public example/FAQ/entry, lost responses after an actual database commit (same command replay), stale command recovery, real API stale-form rejection, saved mission URLs outside the returned list, brief downloads, retained cached views after network failure, denied/stalled recognition and sign-in limiter success/failure behavior. Desktop viewport: 1600×1100; mobile emulation: 375×812. Landing and conductor screenshots were inspected. Quote formatting preserves paise; its unit test covers a fractional quote, a whole-rupee quote and zero. After the final alert-clear and quote-format polish, the production build, all 52 unit tests and four focused desktop/mobile landing and stale-revision tests passed again.

Recognition remains a protocol test double; no hardware microphone quality or Bolna execution proof is claimed. Docker runtime and permanent hosting remain unverified on this Windows host. No schema, account permissions, billing, auth method or real-call switches changed in this pass.

## Earlier browser conductor completion

- Typecheck passed. All **43 unit tests** and **9 PostgreSQL integration tests** passed, including real worker process replacement.
- **8 desktop/mobile browser tests passed** against the optimized production build. These cover mission lifecycle, both mission templates, natural typed creation/revision, pause/resume, restored conductor history, explicit research/plan approvals, evidence, refresh, graph visibility, viewport overflow and unauthenticated rejection.
- Speech-recognition protocol tests send a recognized result through the actual conductor API and database, preserve its voice source, then deny microphone access and verify typed control still works. Recognition is an explicit test double: no hardware recording, speech quality, paid Bolna browser conversation or real telephone execution is claimed.
- New database coverage proves concurrent creation-key deduplication, preservation of existing progress, owner isolation, command deduplication, stale revision rejection, persisted command provenance, pause enforcement and the inability of a voice/text command to approve or book a plan. A replacement research approval revokes earlier permission.
- Optimized build passed, including TypeScript checking and standalone secret stripping. Browser visual inspection covered the conductor dialog and responsive mission views. After adjusting the conversation to keep the newest reply in view, the final production build passed all four focused conductor tests again on desktop/mobile. Both responsive dialog screenshots were inspected.
- The production app was reopened with the existing Supabase email session. A natural-language event goal created a persisted simulation with 40 guests, tomorrow at 18:00 Asia/Kolkata and INR 12,000; simulated research was authorized through its actual approval card. No phone number was requested or used.

`npm run test:e2e:local` manages a temporary loopback-only server on port 3002 with random test credentials, real calls disabled and a separate worker; it cleans up both processes. It never edits operator configuration. The production app remains configured for Supabase email/password auth.

These results complete the supported browser/simulation workflow. Actual Bolna execution and deployment on a permanent host remain unverified. The historical records below distinguish the original delivery from later account setup and product completion.

## Original simulation delivery checks

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

Final code verification: [GitHub Actions run 39122791576](https://github.com/Arham-Begani/Chorus/actions/runs/39122791576) passed for code commit `78049f6`. A clean Linux installation passed type checking, 31 unit tests, 7 PostgreSQL integration tests, 4 browser tests, the production build, and **both web and worker Docker image builds**. GitGuardian also passed. Container runtime deployment and real Bolna calls are still unverified. Later documentation-only commits do not change the tested application.

Final rehearsal additionally found and fixed a revision/hangup race: an active simulated attempt now refreshes and submits under a revision-specific idempotency key before ending. A regression test covers this timing.

Accessibility contrast measured against the elevated surface: primary text 13.75:1, secondary 6.77:1, tertiary 4.89:1. Essential input/control borders were raised to 3.64:1. Next standalone packaging strips local .env files after build; Docker also excludes them from its build context.

## Account setup and callback rehearsal — 2026-10-18

The owner subsequently requested account-backed live setup and selected a local dashboard with protected temporary HTTPS callbacks. A separate Supabase project was provisioned in the chosen organization; its publishable key and project URL were saved in ignored configuration. The owner created an operator and reported successful sign-in; the authenticated empty mission-control view was also observed in the browser. Supabase Auth settings and the Bolna account API both returned HTTP 200. The mission database remains local PostgreSQL; no migration into an unrelated hosted database occurred.

Two Bolna conversation agents were created through the v2 API. GET readback confirmed five conductor tools, four phone tools, independent webhook-header authentication, 180-second hard duration limits and auto_reschedule=false. Account concurrency is two, so local settings restrict outbound to one alongside the conductor. This is account configuration proof, not a voice conversation or phone-call proof. Model/voice availability, runtime context substitution, actual pricing and completed-call artifacts still require the authorized rehearsal.

Latest local code verification: typecheck passed; all 38 unit tests passed; optimized production build passed after stopping the existing Windows server to release its standalone directory lock. New security tests cover gateway route restrictions, missing/wrong secrets, request limits, JSON requirements, stripped cookies/origins, private upstream restrictions, Supabase pool mode and publishable-key compatibility.

Cloudflared 2026.10.1 was downloaded from the official release and its SHA256 matched the release digest. The gateway and temporary tunnel were started. External POST probes measured 404 for the dashboard/login/mission paths, 401 for an unauthenticated webhook, and 202 for an authenticated unknown execution (expected reconciliation behavior). Local web/database health returned HTTP 200; the dedicated worker logged ready. These probes do not start calls and are not provider-originated webhook delivery proof.

Real calls remain disabled pending participant authorization, separate call-cost authorization, verified provider pricing/telephony requirements, and the browser/one-phone proof. The single-VM HTTPS overlay and Caddy configuration are prepared; Linux validation is added to CI. No VM, domain or paid telephony resource was purchased. A temporary callback tunnel is not a production deployment.

# Submission and recovery pass — 2026-10-19

PR #2 merged as ce3039a65cc11563abd3b01f16cab405850d3d6c. This computer's PostgreSQL process had stopped while the web process remained alive. Restarted the existing cluster, waited for crash recovery and reran migrations; web health returned HTTP 200. Existing mission data remained in place. Added scripts/start-local.ps1 to restore missing simulation services with database/web/worker readiness checks, private logs and preserved email auth. It refuses an unrecognized process on port 3000.

Read-only diagnostics: Supabase Auth settings HTTP 200, Bolna account HTTP 200, both configured agents HTTP 200, capacity two total sessions. CALL_ALLOWLIST was empty and real switches disabled. The owner then selected dummy participants only. No browser/provider session or telephone call was started.

An initial rerun of the integration suite exposed unnecessary writes across accumulated finished missions and timed out. Fixed locked mutations to skip saving unchanged aggregates, kept idle ready/approved/paused missions out of progress selection unless they have active attempts, and counted global active real attempts inside PostgreSQL. After that fix, all 10 PostgreSQL integration tests passed on the existing accumulated database, including a new xmin/projection-version regression proving no-op stability and actual-edit persistence. The unit suite passed all 52 tests before this fix; final build/browser/CI results are recorded below when complete.

Added a full pg_dump/pg_restore rehearsal against a separate, uniquely named database in CI. Source web/worker processes exit before fingerprint comparison. The script compares mission/entity/event/migration data and RLS, removes only its own scratch data and does not restore over the source. This is a CI recovery check, not a retained off-host backup or permanent-host proof. The Windows embedded server does not bundle pg_dump/pg_restore.

The actual buildathon form accepts a repository link and requires a pitch deck/video link. SUBMISSION.md includes the 31 October submission date, the observed fields and a 179-character description. No form has been submitted. Real provider proof and selected-host deployment remain unverified.
