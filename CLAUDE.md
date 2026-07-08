# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Collabboard is a real-time collaborative whiteboard: a NestJS API (`collabboard_api/`) and a Next.js frontend (`collabboard_front/`), deployed to AWS ECS/Fargate and, in parallel, to a local kind cluster via Helm/ArgoCD. Full architecture, tech stack, and deployment details are in `README.md` — read it for the big picture (RLS multi-tenancy, Redis-backed realtime, async SQS+Lambda note-history pipeline) before making cross-cutting changes.

## Commands

### Local stack
```bash
docker compose up --build   # postgres:5432, api:3050, front:3000
```

### Backend (`collabboard_api/`)
```bash
npm run start:dev           # watch mode, port 3050
npm run lint                # eslint --fix
npm test                    # jest unit/spec tests
npm run test:rls            # RLS integration test — needs a running Postgres with migrations applied, run with `--runInBand`
npm run test:e2e            # jest -c test/jest-e2e.json
npm run build                # nest build
```
Run a single backend test: `npx jest path/to/file.spec.ts` (or `npx jest -t "test name"`).

### Frontend (`collabboard_front/`)
```bash
npm run dev                 # next dev, port 3000
npm run lint                # next lint
npm test                    # vitest run
npm run build
```
Run a single frontend test: `npx vitest run path/to/file.test.ts`.

### Database migrations
Migrations live in `collabboard_api/migrations/*.sql` and are applied manually/in order — never automatically on push (see CI note below). Locally: `psql ... -f migrations/00N_*.sql` in numeric order, or `node scripts/run-migrations.js` (same script the Helm pre-upgrade hook Job runs). Migration order matters: `001_init_schema_and_seed.sql` → `002_enable_rls.sql` → `003_notify_board_member_changes.sql` → `004_drop_presence_table.sql`.

In CI (`.github/workflows/ci.yml`), the `backend-test` job spins up a real `postgres:16-alpine` service container, applies all four migrations, then runs backend tests and lint/build against it. There is no mocked-DB test path for the backend — RLS behavior is only verified against a real Postgres role setup (`collabboard` owner role applies schema/RLS migrations; tests then run as the restricted `collabboard_app` role via `DB_USERNAME=collabboard_app`).

## Architecture

### RLS-scoped requests (backend)
Every authenticated, non-GET HTTP request is wrapped in a Postgres transaction scoped to the requesting user, enforced by a **global interceptor**, not per-route code:

- `RlsTransactionInterceptor` (`src/database/rls-transaction.interceptor.ts`) is registered as `APP_INTERCEPTOR` in `app.module.ts`. For any HTTP request with an authenticated user (and non-`@Public()` mutations), it opens a transaction via `DatabaseService.runInRlsTransaction()`, sets `app.current_user_id` with `SELECT set_config(...)`, and runs the handler inside it.
- `DatabaseService` (`src/database/database.service.ts`) uses `AsyncLocalStorage` to make the RLS-scoped `EntityManager` available as `db.manager` anywhere in the call stack for that request — services never need to thread a transaction/manager argument through.
- Postgres Row-Level Security policies (`migrations/002_enable_rls.sql`) key off `app.current_user_id`, so authorization is enforced at the database layer, not just in service code. `SECURITY DEFINER` helper functions handle policy checks that would otherwise self-reference (board membership) or run pre-auth (login user lookup).
- The async Lambda note-history writer uses the same restricted `collabboard_app` role, so RLS applies identically on both the sync API path and the async pipeline.
- WebSocket/Socket.IO handlers are **not** covered by this interceptor (`context.getType() !== 'http'` bypasses it) — gateways that touch the DB must scope RLS themselves if needed.

### Realtime layer
- Socket.IO runs behind a Redis pub/sub adapter (`src/redis-io.adapter.ts`) so any ECS task/pod can broadcast to sockets connected on any other instance.
- `src/presence/` tracks board presence in Redis (this replaced an earlier Postgres-table approach — see `004_drop_presence_table.sql` — because it didn't scale past a single instance).
- `src/notes/note-lock.service.ts` implements atomic per-note edit locks in Redis using Lua scripts (`EVAL`) for acquire/renew/release, so lock check-and-set is atomic without a distributed lock library.
- Postgres `pg_notify` (`src/database/pg-notify.service.ts`, wired up in `003_notify_board_member_changes.sql`) complements the Redis adapter for cross-connection notifications — every instance listens independently rather than holding board state in memory.

### Async note-history pipeline
`src/notes/note-history-queue.service.ts` publishes an event to SQS after a note mutation (no-op if `NOTE_HISTORY_QUEUE_URL` is unset, e.g. in local dev). `collabboard_api/lambda/note-history-worker/` is a separate deployable unit — a VPC-attached Lambda that consumes the queue and writes history rows through the same `collabboard_app` role, with a DLQ for failed events. Changes to the `NoteHistoryEvent` shape must be kept in sync between `note-history-queue.service.ts` and `lambda/note-history-worker/index.js`.

### Backend module layout
Feature modules under `src/`: `auth/` (JWT + Google OAuth via Passport strategies/guards), `users/`, `boards/` (board + board-member entities/service/controller), `notes/` (notes, history queue, Redis locking), `presence/` (Socket.IO gateway + service), `database/` (RLS interceptor, DatabaseService, RedisService, pg-notify). Each feature follows the standard Nest `*.module.ts` / `*.controller.ts` / `*.service.ts` / `*.entity.ts` split with colocated `*.spec.ts` tests.

### Frontend structure
Next.js 14 App Router under `src/app/`. Route groups: `(auth)/login`, `(auth)/register`, `boards/[id]` (with `settings` and `trash` subroutes), `dashboard`, `api/[...path]` (proxy). State is split between Zustand stores in `src/store/` (`authStore`, `boardStore`, `canvasStore`) and React Query for server state. `src/hooks/useSocket.ts` / `useBoardSocket.ts` wrap Socket.IO client connections; `src/lib/axios.ts` / `src/lib/socket.ts` centralize API/WS client config.

`NEXT_PUBLIC_*` env vars (API URL, socket URL) are compiled into the client bundle at build time — they must be supplied as Docker build args, not runtime env vars. In production both point at relative, same-origin paths since the ALB/ingress path-routes `/api/*` and `/socket.io/*` to the backend and everything else to the frontend.

### Deployment (two parallel targets, same images/migration script)
- **AWS** (production): Terraform-provisioned (`infra/`), ECS/Fargate behind one ALB, path-based routing. CI (`.github/workflows/ci.yml`) test-gates independent `deploy-api`/`deploy-front` jobs on push to `master`. Migrations run only via manual `workflow_dispatch` (`deploy-migrations` job) — never automatically, since solo pushes to `master` have no independent review gate.
- **Kubernetes/GitOps** (local kind cluster): `deploy/chart/` (hand-built Helm chart, migrations as a values-gated pre-upgrade hook Job running `scripts/run-migrations.js`), `deploy/platform/` (ArgoCD `Application` + install manifest), `deploy/k8s/` (kind cluster config). CI pipeline in `.github/workflows/gitops.yml` builds SHA-tagged images to GHCR and commits tag bumps for ArgoCD to reconcile; `tests.yml` is the shared test gate both CI workflows call. See the README files inside each `deploy/*` subdirectory for build history and incidents.
- Both deployment targets run identical application images and the identical migration script — no app-level branching between orchestrators.
