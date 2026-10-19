# Milestones

- [x] A. Schema, repository conventions, configuration, migrations.
- [x] B. Engine: dependency evidence, timing/capacity/budget, revisions, stale approval, idempotency and uncertainty.
- [x] C. Durable simulation through worker and UI.
- [x] C2. Number-free browser conductor: microphone with typed fallback, natural constraint extraction, two mission types, persisted conversation, revision/status/pause/resume/retry controls and explicit approval handoff.
- [x] C3. Public landing page and interactive example; dedicated workspace, next-step guidance, mobile navigation, fixed conductor composer, command suggestions and sourced brief export.
- [x] C4. Recovery: same-command network retry, stale-edit conflict, sanitized service failure, cached refresh state/backoff, microphone watchdog and shared retry authorization/term invalidation.
- [x] C5. Phone conversation controls: silent canonical tools, native brief/fact arguments, remembered facts, collection/confirmation guidance, durable repeat/error stop, scoped tool-error recovery, source configuration sync and synthetic authenticated quote-flow checks. Revised speech still needs a live retest.
- [x] C6. No-input diagnostics and bounded recovery: correlate exact calls/recordings, preserve private media, configure an actionable unmute check before silence hangup, disable LLM silence re-prompts and validate exact provider readback. Owner confirmed speech was attempted; its recorded incoming channel is very faint. The recovery and quote flow remain unverified live.
- [x] C7. Native quote transport and silent repair: structured JSON variable maps, named INR fields with exact server conversion, optional-detail retention/retraction, durable quote-operation receipts, delayed-retry safety, duplicate suppression and recovery of changed confirmation without asking again. Synthetic signed routes/database checks passed; final build/provider/CI results are recorded in VERIFICATION.md when measured.
- [ ] D. Real browser and outbound proof — the earlier 100-second conversation persisted a scoped brief read. The latest completed quality retest returned equipment busy and a 21-second delivery connection with only the greeting, recipient hangup and no recognized speech/model turns. No structured live observations/offers or full revised conversation is proven. Paid browser voice remains unverified. Three earlier grants retain provisional reserves. The owner-approved one-time delivery test remains ACTIVE for20 October11:00 IST (10:50 preparation), INR50 total,180-second maximum, no retry; the owner explicitly confirmed this date.
- [ ] E. Real three-call coordination — blocked by D and higher account concurrency (current account supports two total sessions).
- [ ] F. Spoken live revisions — blocked by D; tool contracts and browser control implemented locally.
- [x] G. Mission control, evidence, approvals, pause and recovery.
- [x] H. Equipment mission, local verification, container deployment preparation, demo and private role cards. Hosted deployment and live rehearsal remain unverified.

Work on locally achievable parts continues while live verification is blocked. See VERIFICATION.md and SESSION.md for measured results.

2026-10-19 reliability pass: optional call-readiness UI; expiring dated authorizations; a durable shared phone/browser allowance; single browser lease across tabs; strict read-only agent/callback preflight; late terminal evidence recovery; low-wallet terminal status; clearer private provider rejections; combined replanning questions; stable blocked rows; live-session errors no longer sign the operator out. Normal calling switches stay off after the rejected trial request.

Delivery decision, 2026-10-18: the owner selected simulation-ready delivery with documented live setup. D/E/F remain explicitly unverified; they are not represented as completed by simulation tests.

Subsequent request: live setup is now underway. Supabase project/operator and two Bolna agents are configured locally; protected HTTPS callback probes passed. D/E/F still require actual authorized voice/call executions, current pricing/telephony verification and a separate call-cost allowance. The account currently supports conductor plus one outbound call. See integrations/LOCAL_LIVE_TEST.md and the latest VERIFICATION.md section.

Latest direction: finish complete product functionality and keep email authentication sufficient. The browser conductor and simulation are available without a phone number. Optional live-call prerequisites do not block these flows. Docker images and HTTPS configuration are checked in Linux CI; running and restoring the stack on a chosen host remains a deployment verification step.

2026-10-19 submission pass: PR #2 merged into main as ce3039a. Owner selected dummy participants for now, so D/E/F remain pending and real calls remain disabled. Added an idempotent Windows service-start helper, an isolated full PostgreSQL archive/restore check in CI, buildathon form/deadline/submission text and an exact live-test handoff. Idle missions no longer rewrite aggregate/projection rows, and coordination selects unfinished missions or missions with active attempts. A real PostgreSQL row-version regression verifies unchanged mutations do not write while actual edits persist. See SUBMISSION.md and integrations/REAL_CALL_CHECKLIST.md.
