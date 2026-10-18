# Architecture

Next.js browser → authenticated API → PostgreSQL mission aggregate and transactional projections/events. Dedicated Node worker → pg-boss durable wakeups → reserve attempts in a committed transaction → provider adapter outside transaction → persist execution id. Browser polls persisted state; navigation never owns jobs.

Each mission includes immutable revisions; contacts; tasks and informational dependencies; attempts; observations; offers; approval decisions; conflicts; events; simulation responses; and a plan. All prices are integer minor units with currency; times are ISO instants with an explicit mission time zone. Every fact/offer references an attempt and its real/simulation mode. Snapshots and queryable entity projections commit together under a row lock. A worker-wide advisory lock serializes admission across missions. Provider uncertainty occupies a slot until reconciled; ambiguous requests are never redialed by recovery.

The engine deterministically checks summed cost, setup/readiness deadlines, quantity/capacity, evidence confirmation, revision freshness and approvals. Dependency evidence changes a task's next question; active phone agents refresh through get_mission_brief. Changed evidence invalidates plan checks. Simulation adapter chooses a configured offer that satisfies the latest brief where possible, otherwise reports available terms or refusal.

Supabase validates user access tokens server-side. Local password sessions are signed, HttpOnly, loopback-only and simulation-only. Ownership checks precede reads/writes. Bolna static tool header plus per-attempt HMAC capability binds tools to a mission/task/role; the LLM never chooses its permissions. Webhook custom header is verified; unknown execution ids cannot attach themselves to a mission. Status merges cannot regress completed calls. Tool mutation idempotency keys are bound to the attempt. Secrets never enter dashboard responses.

Deployment uses separate web and worker containers with PostgreSQL; Supabase Auth is external. A Sites/edge-only deployment cannot host the required persistent Node worker, so the existing repository and container deployment are retained.
