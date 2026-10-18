# CHORUS voice implementation

TypeScript, Next.js App Router, PostgreSQL, pg-boss. Database state is authoritative. The worker owns dispatch; HTTP handlers never dial. Persist attempts before network requests. Never retry ambiguous dispatches automatically. Simulation and Bolna use the same engine and provenance types. Phone tools cannot change constraints or permissions. User ownership, revision checks and pause checks belong on the server.

Verification: `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:e2e`. Integration/browser tests require the migrated PostgreSQL database. Use `npm run db:local` when Docker is unavailable. Runtime: Node 24.12+; dependencies locked in package-lock.json. No secrets in fixtures, source, screenshots or Git.

Keep TASKS.md and VERIFICATION.md honest. A provider adapter passing mocked HTTP tests is not a live call. Record live blockers separately. At session boundaries update SESSION.md with passed commands, blockers and next task. Purchases and binding reservations are outside this version; approval produces a plan only. Real calls need configured credentials, a participant allowlist, a calling window, and a separate call-cost authorization.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
