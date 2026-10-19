# First live test with a local dashboard

This path keeps CHORUS and its authoritative PostgreSQL database on this computer. Supabase supplies operator authentication; Bolna reaches only an authenticated callback gateway over temporary HTTPS. It is a development rehearsal, not a public deployment. No calls have been verified yet.

For each authorized rehearsal, configure `LIVE_TEST_ID`, `LIVE_TEST_START_AT`, `LIVE_TEST_END_AT`, `LIVE_TEST_BUDGET_MINOR`, `CALL_COST_RESERVE_MINOR` and `BROWSER_COST_RESERVE_MINOR` privately. Start/end need explicit ISO timezone offsets and span at most 24 hours. The total ceiling covers phone/browser attempts across missions and restarts; outbound research also has its own limit. Uncertain dispatches, unsettled billing and mission deletion do not clear reserves. Explicit pre-acceptance rejections and provider-finalized zero-duration/zero-cost results release unused allowance with an audit record; a provisional zero does not. The phone icon in `/app` displays a secret-free readiness/budget summary. Online diagnostics verify actual agent bindings and callback reachability without dialing.

## 1. Supabase project and operator

Create a dedicated CHORUS project in the owner's chosen organization. Existing projects and their users stay untouched. Choose a nearby region and review the project's quoted cost before any paid creation. For this first test do not migrate the local mission database: Supabase Auth works independently of where CHORUS stores missions.

From the project's **Connect** dialog copy the project URL and **publishable key** into the ignored `voice/.env` as `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. No `service_role` or `sb_secret` key is needed. `SUPABASE_ANON_KEY` is supported only as a legacy fallback. [Official key guide](https://supabase.com/docs/guides/getting-started/api-keys).

Enable email/password in Authentication, create the operator under Authentication → Users → Add user, and have the operator privately enter the password. Do not paste the password into chat. Set the Auth Site URL to `http://localhost:3000` for this rehearsal. CHORUS currently signs in existing users; it has no public signup or password-reset flow. Disable public signups if only invited operators should use the project. Set `AUTH_MODE=supabase`, keeping `SIMULATION_ONLY=true` and `ENABLE_REAL_CALLS=false`, then restart web and worker. Sign into CHORUS with that operator and run a simulation first. Access-token expiry currently requires signing in again.

## 2. Prepare protected HTTPS callbacks

From `voice/`, with Node 24.12+:

```sh
npm run setup -- --live-secrets
npm run callbacks
```

The gateway binds `127.0.0.1:3001` and forwards to the app at `127.0.0.1:3000`. It accepts only POST JSON for the eight named `/api/tools/<name>` routes and `/api/bolna/webhook`. It requires the appropriate independent secret before forwarding, caps request bodies at 64,000 bytes, and strips cookies, origins and forwarded headers. Tools still require a scoped, expiring capability verified by the app. Dashboard, login, health, mission APIs, unknown tool names and query-string variants return 404 at the gateway. Do not tunnel port 3000.

In another terminal use Cloudflare's official `cloudflared` download:

```sh
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:3001
```

Copy the resulting HTTPS origin to `CHORUS_CALLBACK_ORIGIN` in `.env`; leave `APP_ORIGIN=http://localhost:3000`. [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) require no account/domain but have no uptime guarantee and change hostname on restart. Keep both gateway and tunnel processes running during a test. Stopping either ends callback access. Cloudflare relays callback contents; use test mission data and authorized participants.

```sh
npm run bolna:tools:private
```

This writes actual callback URLs and the tool secret to **ignored** `.data/bolna/conductor-tools.json` and `phone-tools.json`. Import only into Bolna's private agent settings. Do not upload these to GitHub, share screenshots of their contents, or replace the committed placeholder files with them. Regenerate/re-import after a tunnel hostname change.

## 3. Bolna account and two agents

Sign into [Bolna](https://platform.bolna.ai). Save its API key as `BOLNA_API_KEY` privately. Create two conversation agents named CHORUS conductor and CHORUS phone, using this directory's role prompts and corresponding private tool definitions. Save their distinct IDs in `BOLNA_CONDUCTOR_AGENT_ID` and `BOLNA_PHONE_AGENT_ID`. Set provider voice/language and outbound caller identity available to the account. Verify any destination/number requirements in the account before buying or provisioning telephony.

Phone agent: introduce itself as an AI research assistant; no purchase, reservation, transfer, payment or automatic retry tools. Set its provider-side hard duration limit to `MAX_CALL_SECONDS` and disable automatic rescheduling/retries. The API's `user_data.max_duration_seconds` is context, not a provider-enforced limit. Configure webhook URL `CHORUS_CALLBACK_ORIGIN/api/bolna/webhook` and header `x-chorus-webhook-secret` with `BOLNA_WEBHOOK_SECRET`. Configure all statuses supported by the account. Verify the platform substitutes `%(chorus_token)s` from runtime `user_data` into each tool request; that mapping remains an integration test, not an assumed success.

Use `OUTBOUND_CONCURRENCY=1` first. `ACCOUNT_CONCURRENCY` must reflect the verified plan and allow at least two sessions including the browser conductor. Three simultaneous phones plus conductor later require at least four. The read-only diagnostic checks the documented account and agent endpoints:

```sh
npm run doctor
npm run doctor -- --online
```

Diagnostics print status and configuration names, never keys, participant numbers, full agent definitions or account identity. They make no call requests and do not enable calling. Passing these checks is not a successful voice call.

## 4. Authorize one test and enable deliberately

The participant must authorize receiving an AI test call, and the owner must choose a separate maximum telephony spend. Enter only that E.164 number in `CALL_ALLOWLIST`. Choose a suitable calling window and timezone. Set `MAX_CALLS_PER_MISSION=1` for a single-attempt rehearsal, `MAX_CALL_SECONDS` to the verified hard limit, and `CALL_COST_RESERVE_MINOR` to a conservative worst-case charge for one full call in paise. Review current account pricing and available balance; the mission's event spending budget is not this allowance. Provider costs can apply to browser voice too; account/provider limits must be configured separately.

Only after the account limits, retries, pricing, participant and window are verified: set `LIVE_AGENT_LIMITS_VERIFIED=true`, `SIMULATION_ONLY=false`, `ENABLE_REAL_CALLS=true`, `AUTH_MODE=supabase`, then restart both web and worker. A switch alone does not approve a dial. Create a fresh real mission and authorize just one task's allowlisted contact. Approve current research and the separate call-cost amount in CHORUS. Leave other contacts unauthorized.

Follow [BOLNA_SETUP.md](BOLNA_SETUP.md) for browser tool proof, one outbound structured observation, execution/callback reconciliation, then concurrency and spoken-revision proof. Record actual execution IDs and observed results privately; do not mark milestones complete from mocked tests. Pause blocks new dispatches; it does not guarantee active-call termination. Use the provider's controls to stop an active test if needed.

## 5. End the rehearsal

Pause live missions, stop any active provider/browser sessions, restore `SIMULATION_ONLY=true` and `ENABLE_REAL_CALLS=false`, then restart web and worker. Stop cloudflared and the callback gateway. Review call history and actual charges. Keep the allowlist narrow. No public deployment has occurred; production requires stable HTTPS, a persistent worker, a private database, backups/retention, and runtime verification described in [DEPLOYMENT.md](../DEPLOYMENT.md).
