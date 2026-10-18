# Milestones

- [x] A. Schema, repository conventions, configuration, migrations.
- [x] B. Engine: dependency evidence, timing/capacity/budget, revisions, stale approval, idempotency and uncertainty.
- [x] C. Durable simulation through worker and UI.
- [ ] D. Real browser and outbound proof — awaiting participant, call-cost/time authorization and pricing review. Accounts and protected HTTPS callback probes are configured.
- [ ] E. Real three-call coordination — blocked by D and higher account concurrency (current account supports two total sessions).
- [ ] F. Spoken live revisions — blocked by D; tool contracts and browser control implemented locally.
- [x] G. Mission control, evidence, approvals, pause and recovery.
- [x] H. Equipment mission, local verification, container deployment preparation, demo and private role cards. Hosted deployment and live rehearsal remain unverified.

Work on locally achievable parts continues while live verification is blocked. See VERIFICATION.md and SESSION.md for measured results.

Delivery decision, 2026-10-18: the owner selected simulation-ready delivery with documented live setup. D/E/F remain explicitly unverified; they are not represented as completed by simulation tests.

Subsequent request: live setup is now underway. Supabase project/operator and two Bolna agents are configured locally; protected HTTPS callback probes passed. D/E/F still require actual authorized voice/call executions, current pricing/telephony verification and a separate call-cost allowance. The account currently supports conductor plus one outbound call. See integrations/LOCAL_LIVE_TEST.md and the latest VERIFICATION.md section.
