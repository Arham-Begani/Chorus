# Session handoff — 2026-10-18

## Current direction

Finish product functionality; email/password auth is sufficient. Phone setup must not block browser commands or simulation. The operator created a Supabase user and successfully signed in. No further auth setup is requested. Never request credentials in chat.

## Implementation

The unrelated Midnight product is preserved. CHORUS lives in voice/. PR #1 was merged into main as 4546542. Current work continues on feat/live-setup in PR #2: https://github.com/Arham-Begani/Chorus/pull/2.

The app has an authenticated Next.js dashboard, durable PostgreSQL aggregate/projections/events, pg-boss worker, shared coordination engine, configurable event relocation and equipment/delivery simulations, source evidence, approvals, revisions, pause/recovery and Bolna adapter/tool/callback contracts. Binding purchases, reservations and cancellations are outside this version.

The number-free browser conductor now accepts typed text and browser SpeechRecognition input with optional spoken replies. It creates either supported mission, extracts INR budgets/capacity/zoned deadlines, revises constraints, reports persisted status, pauses/resumes, requests research approval and prepares task retries. Conversations persist across refresh. Owner-scoped creation keys prevent duplicate missions or resetting progress; commands use deduplication and revision checks under row locks. Explicit approval cards still control research and plans. A deterministic interpreter handles these supported commands; this is not a general conversational model or fabricated business-call audio.

## Verification

Latest measured commands and browser results are in VERIFICATION.md. Hardware microphone capture, Bolna browser execution, outbound calls and real simultaneous-call coordination remain unverified. Recognition protocol tests use an explicit test double and the actual authenticated API/database.

Local database: native PostgreSQL 17.6, loopback port 55432, persistent ignored .data/postgres. Node 24.19.0 is required; system Node 20 is too old. Use the bundled runtime or Node 24.12+. Production web runs on localhost:3000 using the operator's configured Supabase email auth; worker is separate. Runtime PIDs/logs are ignored under .data. On Windows stop the web process before rebuilding, because standalone files remain locked.

For independent browser verification, stop the normal worker and run npm run build then npm run test:e2e:local. This launches a temporary loopback server on port 3002 with random test credentials, disables real calls, runs desktop/mobile tests and stops its processes. It does not edit the operator's .env or auth. Restart the normal worker afterwards.

## Optional live integration and deployment

Supabase project/operator and two Bolna agents are configured privately. Agent GET readback verified role tools, webhook headers, 180-second caps and disabled auto-rescheduling. Account capacity is two sessions, so local outbound concurrency is one alongside conductor. No actual browser conversation or telephone call has been started. Real-call flags remain disabled. Never infer real success from simulation or adapter tests.

A callback-only gateway and temporary HTTPS tunnel were probed: dashboard/login/mission paths 404, unauthenticated webhook 401, authenticated unknown execution 202. The tunnel is temporary and is not public product hosting. Ignored .env contains secrets; preserve user values. Agent/tool exports are private. No paid infrastructure or telephone resource has been purchased.

Web, worker and migration Docker targets, private PostgreSQL Compose and optional Caddy HTTPS overlay are prepared and validated by Linux CI. Docker cannot run on this Windows host because virtualization is disabled; no system settings were changed. Deployment on a chosen permanent host, TLS/DNS, backup restore and runtime smoke checks remain to be performed there. No host/domain has been selected.

Remaining live proof needs authorized destination participants, a calling window, verified provider pricing/telephony and a separate call-cost approval. These requirements apply only to actual calls. See integrations/LOCAL_LIVE_TEST.md and integrations/BOLNA_SETUP.md; keep all number-free functionality available while those are pending.
