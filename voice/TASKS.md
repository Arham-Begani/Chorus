# Milestones

- [x] A. Schema, repository conventions, configuration, migrations.
- [x] B. Engine: dependency evidence, timing/capacity/budget, revisions, stale approval, idempotency and uncertainty.
- [x] C. Durable simulation through worker and UI.
- [x] C2. Number-free browser conductor: microphone with typed fallback, natural constraint extraction, two mission types, persisted conversation, revision/status/pause/resume/retry controls and explicit approval handoff.
- [x] C3. Public landing page and interactive example; dedicated workspace, next-step guidance, mobile navigation, fixed conductor composer, command suggestions and sourced brief export.
- [x] C4. Recovery: same-command network retry, stale-edit conflict, sanitized service failure, cached refresh state/backoff, microphone watchdog and shared retry authorization/term invalidation.
- [x] C5. Phone conversation controls: silent canonical tools, native brief/fact arguments, remembered facts, collection/confirmation guidance, durable repeat/error stop, scoped tool-error recovery, source configuration sync and synthetic authenticated quote-flow checks. Revised speech still needs a live retest.
- [ ] D. Real browser and outbound proof — the earlier 100-second conversation persisted a scoped brief read. The new approved quality retest returned equipment busy and a 21-second delivery connection with only the greeting, recipient hangup and no recognized speech/model turns. No structured live observations/offers or full revised conversation is proven. Paid browser voice remains unverified. All three grants retain provisional reserves; previous ledger rows were unchanged and no further call is scheduled.
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
