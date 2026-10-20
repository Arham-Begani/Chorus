# CHORUS submission package

## Bolna Symphony Buildathon

Reviewed the [event page](https://www.bolna.ai/symphony/buildathon) and [actual submission form](https://www.bolna.ai/symphony/buildathon/submit) on 20 October 2026. The form returned HTTP200. The event page lists **31 October 2026** as the submission date; it does not specify a cutoff time/timezone. The **20 November** date is the finale. Confirm the cutoff with the organizer if submitting near the deadline.

The form asks for team size, full name, the same email used to register, project name, a description of at most 200 characters, a submission link, and a pitch deck or video link. It accepts a GitHub repository, live application or demo as the submission link. For the pitch it requests a Google Drive or Luma link with anyone-with-the-link access. No separate published judging rubric, required video duration or requirement for permanent hosting appears on those pages. This is an observed form checklist, not a guarantee of acceptance.

## Ready-to-paste fields

**Project name:** CHORUS

**Description (179 characters):**

> CHORUS helps event organizers coordinate venue, catering and delivery research by voice, check shared timing and budget constraints, and review a sourced plan. Working simulation.

**Submission link:** https://github.com/Arham-Begani/Chorus/tree/main/voice

**Pitch deck:** [CHORUS Buildathon pitch](https://docs.google.com/presentation/d/1jxlDhMXbVzT6sbEnf7j6L3BUSDWR5wP06I2qFlDGmnU). Six slides, updated 20 October with the measured 153-test result, actual simulation screenshots and explicit limits on live quote proof. Every slide of the final PDF export was rendered and visually reviewed. **Public viewing still needs the owner to set Share → General access → Anyone with the link → Viewer**, then check this URL signed out. The Drive connector supports individual/domain sharing, not public-anyone permissions. The 20 October signed-out check returned HTTP401. A private deck is not a usable judge link. Do not paste a local filesystem URL into the form.

Team size, registered email and participant identity are owner-supplied. No application or final submission has been sent by the agent.

## What judges can try

Follow [README.md](README.md) from `voice/`. Node 24.12+ and PostgreSQL 17 are required. On this configured Windows installation, `powershell -NoProfile -File scripts/start-local.ps1` restores missing database/web/worker processes and waits for readiness. It preserves existing data, email auth and `.env`. It supports the documented local simulation configuration only. A fresh install still needs `npm ci`, `npm run setup` and `npm run build` first.

Open `/` for the landing page, `/app` for mission control. Email/password is sufficient for the configured operator. For an independent local checkout, the generated local simulation password works without a phone number or provider account.

The [three-minute script](DEMO.md) covers event relocation, the venue/caterer setup conflict, a spoken or typed budget revision, evidence and plan approval. Equipment rental/delivery demonstrates reuse. Empty simulated responses demonstrate blocked research. The UI and exported evidence explicitly identify simulation. Plan approval does not purchase or reserve anything.

## Claim boundary

Implemented: responsive landing/workspace, current quote comparison, filtered source evidence and readable history, browser speech with typed fallback, persisted commands, two mission types, PostgreSQL events, revision/approval checks, worker recovery, Bolna adapters and protected tools/callbacks. Current-offer selection is shared across comparison, cards, graph and exports. CI covers unit, PostgreSQL integration and desktop/mobile browser tests, production/image builds and HTTPS configuration.

**Verified application:** [PR #11](https://github.com/Arham-Begani/Chorus/pull/11) merged after [Linux CI](https://github.com/Arham-Begani/Chorus/actions/runs/39418268872) passed **153 tests (103 unit, 26 PostgreSQL, 24 desktop/mobile browser)**, typecheck/build, both Docker images, actual worker recovery, complete archive/isolated restore with matching data and RLS, HTTPS configuration and GitGuardian. Quote capture uses named INR fields with exact server conversion, safe JSON mappings and silent confirmation repair. Synthetic signed routes prove corrections, idempotency and security denials. Both canonical hosted agents passed synchronization and an independent exact readback on 20 October, including the full-sentence audio handshake, native quote mappings, silent tools, 180-second cap and zero LLM silence repeats. This readback is configuration evidence; live execution remains unverified.

**Live proof so far:** one answered outbound call completed in100 seconds, returned a transcript and invoked the authenticated, attempt-scoped brief tool. A later21-second delivery connection transcribed only the greeting, with no recognized speech/model/tool turns. The participant spoke but received no reply; private recording diagnostics show a faint incoming track, without identifying its cause. No structured live observation or offer was collected. The context, pacing, loop recovery and quote-tool improvements therefore need an actual successful spoken retest. See [VERIFICATION.md](VERIFICATION.md).

**Not yet proven:** structured live quote collection, a coordinated live research plan, a paid Bolna browser conversation, three simultaneous phone calls and spoken changes during those calls. Browser-recognition tests use a protocol double. Configuration and simulation are not provider execution evidence. The account last reported two total sessions; CHORUS conservatively permits one outbound alongside the conductor. The original three-phone-plus-conductor rehearsal needs at least four total slots and three authorized destinations. That concurrency target comes from the project brief, not a published event requirement. Permanent hosting is optional for the observed submission form and remains undeployed.

The 20 October 11:00 INR50 one-call appointment was skipped after automatic approval review rejected its combined temporary callback/preflight command as **“blocked by policy.”** No call runner executed or mission/reservation was created; the exact automation remains PAUSED. A later bounded callback-session implementation successfully verified dashboard404, unauthenticated webhook401 and authenticated unknown execution202, then synchronized both agents. The owner explicitly said **“no need to test now, just do app work.”** The owned session was closed and no afternoon call, paid browser session, reservation, retry or replacement schedule was created. Earlier real missions remain paused and ordinary live switches disabled. Before any future authorized test, start a fresh protected session, refresh the origin and resynchronize; the old temporary URL is closed. Preserve provisional reserves until definitive billing reconciliation. Public pitch viewing remains an owner step.

## Final owner actions

1. Confirm registration, team size and the registered email.
2. Review the pitch and set its final Drive/Luma link to anyone-with-the-link viewer access. Check it signed out.
3. Rehearse from a fresh simulation mission, with a typed-command fallback available if the browser speech service is unavailable.
4. Review the current claim boundary, then submit the form before the organizer's cutoff.
5. If upgrading the entry to a real-call demonstration, complete the participant/cost/window requirements in [LOCAL_LIVE_TEST.md](integrations/LOCAL_LIVE_TEST.md) and record actual evidence before changing any claims.
