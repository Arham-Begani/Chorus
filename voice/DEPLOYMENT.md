# Deploy web and worker

No paid hosting account was provisioned. This Windows host has no Docker and WSL virtualization is disabled. GitHub CI builds both images on Linux and runs a disposable web/worker/migration/PostgreSQL stack using compose.ci.yaml, web health, persisted simulation across worker restart and an isolated archive restore. See the current run for its measured outcome. This CI override disables real calls and retains production Supabase auth mode; it is never part of the production HTTPS command. The independent desktop/mobile browser suite exercises the UI. A localhost-only local-auth login is intentionally unsuitable across a Docker bridge.

Use a VM/container host that supports long-running Node processes, outbound HTTPS and PostgreSQL. A web-only serverless or Sites deployment is insufficient for the worker. A web deploy without a running worker will display missions but cannot coordinate research.

1. Use Node 24.12+ or Docker Engine + Compose. Clone main and `cd voice`. Copy .env.example to .env. Generate strong SESSION_SECRET and a URL-safe POSTGRES_PASSWORD; add POSTGRES_PASSWORD to .env for Compose. Set APP_ORIGIN to your actual HTTPS origin.
2. Create a Supabase project, enable email/password Auth, create the authorized operator account and set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (legacy SUPABASE_ANON_KEY remains supported). Use AUTH_MODE=supabase. The application validates tokens with getUser. Sessions expire with Supabase's access token; sign in again when expired. The database can be this Compose PostgreSQL or a Supabase direct/session-pool connection that supports pg-boss. Do not use a transaction-mode pool for advisory locks. Copy the exact session endpoint from Connect, port 5432; use sslmode=verify-full and the project's CA certificate via sslrootcert if your trust store needs it. Never set NODE_TLS_REJECT_UNAUTHORIZED=0 or disable certificate verification to resolve a connection error. [Supabase connection reference](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Initially keep SIMULATION_ONLY=true and ENABLE_REAL_CALLS=false. `docker compose up --build -d`. The migration container must succeed before web/worker start. PostgreSQL is on the private container network; port 3000 binds host loopback. Put an HTTPS reverse proxy in front of it with request-body limits and the exact APP_ORIGIN. Use a persistent DB volume and automated encrypted backups.
4. Check `docker compose ps`, `docker compose logs --tail=100 migrate worker web` and `curl --fail http://127.0.0.1:3000/api/health`. Sign in through HTTPS, run simulation, refresh, restart worker (`docker compose restart worker`), and confirm the same mission/attempts continue. Check queue job failures and database connectivity. `/api/health` verifies web-to-database connectivity, not worker liveness; worker log readiness and pg-boss job completion are separate checks.
5. Complete integrations/BOLNA_SETUP.md to enable real calls. Register callbacks with custom secrets and configure allowed participants and call costs. Budget and permissions are enforced by backend/worker, never browser controls alone.

For managed PostgreSQL, set DATABASE_URL in the hosting secret store, run `npm ci && npm run db:migrate && npm run build`, run web `npm start` with CHORUS_HOST=0.0.0.0 behind your reverse proxy, worker `node --import tsx worker/index.ts`. Without CHORUS_HOST, npm start binds loopback for local verification. With no local .env, the worker's production direct command reads environment variables; npm run worker expects a .env file for local development. Both must use the same SESSION_SECRET and database. Secrets are runtime inputs; no secret is required for the build.

Rollback by deploying the previous image; migration 001 is additive. Back up DB before schema upgrades. Never drop the database to resolve job failures. The aggregate/projection/event writes are transactional; uncertain call reservations deliberately survive worker crashes.

Production limits: direct database role must remain private, RLS tables have no anon policies; no fine-grained organization sharing, refresh-token session renewal, billing dashboard, transcript retention policy or automated erasure workflow is included. Set operational retention/backups before storing real participant transcripts. Live-call readiness remains blocked until account configuration and authorized testing are completed.

## HTTPS on a single VM

`compose.https.yaml` adds Caddy in front of the existing private web/worker/database stack. Set `CHORUS_DOMAIN` to a domain you control and `APP_ORIGIN=https://<that-domain>`. Point its A/AAAA records to the VM and allow inbound 80/443; keep database ports private. Review hosting cost before creating a VM. Then:

```sh
docker compose -f compose.yaml -f compose.https.yaml config --quiet
docker compose -f compose.yaml -f compose.https.yaml up --build -d
```

The Caddyfile enforces a 64KB request body cap and proxies web:3000; named volumes preserve TLS state. [Caddy automatically obtains and renews public certificates](https://caddyserver.com/docs/automatic-https) when DNS and ports are configured correctly. This overlay has no domain or paid service attached. Validate it on the eventual host, then test sign-in, simulation, refresh, worker replacement and database restore before accepting live traffic. Back up the persistent database and test a restore to a separate database; a volume is not a backup. Never use `docker compose down -v` on persisted mission data.

For a local integration rehearsal instead, use [LOCAL_LIVE_TEST.md](integrations/LOCAL_LIVE_TEST.md). Its temporary tunnel exposes only callbacks and is not a stable production URL.

## Backup and restore rehearsal

On the Linux Compose host, pause admission and stop web/worker for a quiet comparison, leaving PostgreSQL running. From `voice/`, run `bash scripts/verify-backup.sh "$(docker compose ps -q postgres)"`. The script makes a full custom-format archive, restores into a uniquely named temporary database in that container and compares mission, event, entity and migration contents plus RLS. It removes only its own temporary database/archive. It never restores over the source database. CI runs the same script against PostgreSQL 17 after the browser-test processes exit. This verifies archive recovery; permanent-host recovery still needs its own rehearsal.

For retained backups, use PostgreSQL 17's `pg_dump --format custom` with your private connection settings, then encrypt the archive and store it off-host with a retention schedule. `pg_dump` contains one database, including the pg-boss schema, but not cluster roles or Supabase Auth users. Archive those independent services/settings through their own supported procedures. Restore with `pg_restore --exit-on-error` into a new empty database and review the restored data before changing DATABASE_URL. Never start a live worker against an old backup until you have reconciled all real provider executions: restoring local data cannot undo a call that already happened. [PostgreSQL archive documentation](https://www.postgresql.org/docs/17/app-pgdump.html), [restore documentation](https://www.postgresql.org/docs/17/app-pgrestore.html).

The native Windows development dependency ships the server but not pg_dump/pg_restore. Use the Linux/container rehearsal or separately installed official PostgreSQL 17 client tools; the local runtime helper is not a backup system. No retained off-host backup or permanent-host restore is claimed here.
