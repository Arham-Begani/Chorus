# Phone conversation quality

Latest approved retest, 19 October 18:30 IST: equipment returned busy; delivery connected for 21 seconds and the carrier reported recipient hangup. Only the one greeting was transcribed, with no recognized user speech or model turns. No brief read or structured quote was collected. The full revised flow therefore remains unverified. The two-attempt allowance is complete; no retry is authorized by this guide. Recordings were present inside carrier metadata, which the evidence importer now handles; their URLs and raw logs remain private.

The 19 October answered rehearsal exposed repeated "Let me check the shared mission brief" audio, unclear purpose/identity and no structured terms. That exact phrase was configured as every tool's pre-call message, including writes. Descriptions also encouraged repeated refreshes. This pass removes those triggers and adds persisted recovery controls. It does not prove the revised speech has been tested live.

## Controls

- Silent tools and one platform greeting. Each tool explicitly sets pre_call_message to an empty string: actual provider readback showed that omitting it inserts default spoken filler. No model-generated arguments for brief reads; native key/text fields for facts and clarification. Legacy payload_json remains accepted, including offers.
- Actual mission goal and task identity in the brief. Explicit test disclosure, direct identity answers and honest missing details.
- Per-attempt fact deduplication and remembered facts. Unchanged brief reads warn on the second and latch conversation.action=end on the fourth.
- One actionable correction for invalid arguments/stale terms, then an end instruction after a second failure. Secret, scope and role checks are never softened by recovery.
- Phone write responses concern the assigned task. Confirmed complete terms can end that call while other tasks remain unfinished.
- One owner clarification for missing essential details, followed by an end instruction. No callback promise. Quality stops require explicit review/retry before further dispatch.
- Phone pacing: 450 ms endpointing, 500 ms incremental delay, two-word interruption threshold, no presence nag, 15-second silence timeout and the existing maximum of 180 seconds. Prompt-based completion has explicit decline/completion criteria and an interruptible goodbye.

The server can refuse more tools and instruct a polite end; it cannot guarantee every model response or instant active-call termination. Provider silence and duration limits remain the backstop. New pacing and prompt-based hangup require live verification.

## Synchronize existing agents

From voice/ with private .env:

```sh
npm run bolna:sync
npm run bolna:sync -- --apply
```

Default behavior is read-only: check exact source prompts, tool descriptions/schemas/bindings and phone pacing, exiting nonzero on drift. The explicit apply flag snapshots the latest GET privately under ignored .data/bolna, updates the existing task contract and verifies readback. LLM, voice and telephony providers are preserved and compared. Unsupported rich-text compositions or unexpected speech providers fail before that agent is changed. No agent/resource purchase, credential/calling-switch change, phone call or browser session occurs. A stopped callback tunnel must be refreshed and probed before a later authorized call.

Generated placeholder JSON and checks share src/providers/bolna-tools.ts, preventing prompt-only fixes from leaving old filler behind. Primary references: [custom schemas](https://www.bolna.ai/docs/tool-calling/custom-function-schema), [endpointing](https://www.bolna.ai/docs/deepgram-transcriber), [interruptions](https://www.bolna.ai/docs/agent-setup/engine-tab), [hangup limits](https://www.bolna.ai/docs/outbound/hangup-calls), [agent updates](https://www.bolna.ai/docs/api-reference/agent/v2/update).

## Verification boundary

Unit cases exercise repeated checks, meaningful progress versus duplicate facts, revisions, malformed JSON, stale offers, clarification, completion, pause and permissions. PostgreSQL tests invoke actual authenticated route handlers with signed fixture capabilities, persist two synthetic sourced quotes, evaluate their plan and invalidate it after a budget revision. A fresh connection verifies durable stop state. No model, phone network or provider conversation is involved; these tests are not live quote proof.

Before a separately approved retest, brief consenting participants on their equipment/delivery roles and a specific fictional service. Include that service and any public organizer identity in the operator goal. Check:

An illustrative goal is: "Authorized CHORUS product rehearsal, not a booking: research two speakers and two wireless microphones for 40 people at the chosen event date/time, with delivery and installation, under INR8,000." Enter the actual chosen date/time and zone in the mission constraints. In this fictional test the equipment participant can offer INR5,000 including fees, capacity 40 and readiness one hour before the event; delivery can offer INR1,500 including fees, readiness one hour before and 30-minute setup. Let participants answer and correct these details naturally. Expected combined total is INR6,500; a later INR6,000 owner budget must invalidate the plan. These are role-play inputs, not actual provider quotes or authorization to dial.

| Participant action                     | Expected behavior                                                          |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Repeats identity/company questions     | Direct answers, no repeated tool filler; unknown organizer admitted.       |
| Asks which equipment                   | Specific service from goal, otherwise one clarification and end.           |
| Pauses/interrupts                      | Time to finish; latest question answered without restarting greeting.      |
| Gives availability and price           | Facts saved once, answers remembered.                                      |
| Confirms/corrects quote                | Current source/revision retained; corrected terms supersede earlier terms. |
| Owner changes budget/time              | Fresh brief before terms; old proposals cannot be approved.                |
| Declines/wrong person/callback request | Polite end, no pressure or callback promise.                               |
| Tool error or repeated checks          | One repair then polite end; no false saved-success claim.                  |

Review the actual transcript and scoped observations/offers. Configuration readback alone cannot prove conversation quality. No call is authorized by this document.
