# CHORUS submission package

## Bolna Symphony Buildathon

Reviewed the [event page](https://www.bolna.ai/symphony/buildathon) and [actual submission form](https://www.bolna.ai/symphony/buildathon/submit) on 19 October 2026. The page lists **31 October 2026** as the submission date; it does not specify a cutoff time/timezone. The **20 November** date is the finale. Confirm the cutoff with the organizer if submitting near the deadline.

The form asks for team size, full name, the same email used to register, project name, a description of at most 200 characters, a submission link, and a pitch deck or video link. It accepts a GitHub repository, live application or demo as the submission link. For the pitch it requests a Google Drive or Luma link with anyone-with-the-link access. No separate published judging rubric, required video duration or requirement for permanent hosting appears on those pages. This is an observed form checklist, not a guarantee of acceptance.

## Ready-to-paste fields

**Project name:** CHORUS

**Description (179 characters):**

> CHORUS helps event organizers coordinate venue, catering and delivery research by voice, check shared timing and budget constraints, and review a sourced plan. Working simulation.

**Submission link:** https://github.com/Arham-Begani/Chorus/tree/main/voice

**Pitch deck:** [CHORUS Buildathon pitch](https://docs.google.com/presentation/d/1jxlDhMXbVzT6sbEnf7j6L3BUSDWR5wP06I2qFlDGmnU). Six slides, with the actual simulation screenshots and an explicit live-validation boundary. The imported deck's full PDF export was rendered and visually reviewed after repairing missing screenshot media. **Public viewing still needs the owner to set Share → General access → Anyone with the link → Viewer**, then check this URL signed out. The Drive connector cannot set public-link permissions and this browser is signed out of Google. A private deck is not a usable judge link. Do not paste a local filesystem URL into the form.

Team size, registered email and participant identity are owner-supplied. No application or final submission has been sent by the agent.

## What judges can try

Follow [README.md](README.md) from `voice/`. Node 24.12+ and PostgreSQL 17 are required. On this configured Windows installation, `powershell -NoProfile -File scripts/start-local.ps1` restores missing database/web/worker processes and waits for readiness. It preserves existing data, email auth and `.env`. It supports the documented local simulation configuration only. A fresh install still needs `npm ci`, `npm run setup` and `npm run build` first.

Open `/` for the landing page, `/app` for mission control. Email/password is sufficient for the configured operator. For an independent local checkout, the generated local simulation password works without a phone number or provider account.

The [three-minute script](DEMO.md) covers event relocation, the venue/caterer setup conflict, a spoken or typed budget revision, evidence and plan approval. Equipment rental/delivery demonstrates reuse. Empty simulated responses demonstrate blocked research. The UI and exported evidence explicitly identify simulation. Plan approval does not purchase or reserve anything.

## Claim boundary

Implemented: responsive landing/workspace, browser speech with typed fallback, persisted commands, two mission types, PostgreSQL events and source evidence, revision/approval checks, worker recovery, Bolna adapters and protected tools/callbacks. CI covers unit, PostgreSQL integration and desktop/mobile browser tests, production/image builds and HTTPS configuration.

**Live proof so far:** one answered outbound call completed in 100 seconds, returned a transcript and invoked the authenticated, attempt-scoped brief tool. This proves phone connectivity and runtime capability substitution for that read tool. No structured observation or offer was collected. The other recent destination returned busy. A missing-context/conversation correction was merged in PR #6 and passed 106 tests; it has not been retested in a live conversation. See [VERIFICATION.md](VERIFICATION.md) for measured evidence.

**Not yet proven:** structured live quote collection, a coordinated live research plan, a paid Bolna browser conversation, three simultaneous phone calls and spoken changes during those calls. Browser-recognition tests use a protocol double. Configuration and simulation are not provider execution evidence. The account last reported two total sessions; CHORUS conservatively permits one outbound alongside the conductor. The original three-phone-plus-conductor rehearsal needs at least four total slots and three authorized destinations. That concurrency target comes from the project brief, not a published event requirement. Permanent hosting is optional for the observed submission form and remains undeployed.

The owner authorized bounded tests with consenting participants; those attempts are complete and missions paused. Normal real-call switches remain disabled and temporary callbacks were stopped. No further call is scheduled or authorized by the completed two-attempt approval. Preserve provisional reserves until definitive billing reconciliation; do not reset grants or invent dummy telephone numbers. Public pitch access was rechecked on 19 October and still redirected to Google sign-in.

## Final owner actions

1. Confirm registration, team size and the registered email.
2. Review the pitch and set its final Drive/Luma link to anyone-with-the-link viewer access. Check it signed out.
3. Rehearse from a fresh simulation mission, with a typed-command fallback available if the browser speech service is unavailable.
4. Review the current claim boundary, then submit the form before the organizer's cutoff.
5. If upgrading the entry to a real-call demonstration, complete the participant/cost/window requirements in [LOCAL_LIVE_TEST.md](integrations/LOCAL_LIVE_TEST.md) and record actual evidence before changing any claims.
