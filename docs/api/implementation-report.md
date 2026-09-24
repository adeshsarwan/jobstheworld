# Internal implementation and validation report

Base: codex/cloudflare-workers-migration at 990e1fb44a2d77b1aad1d99d2a308be80a4f690c. Work branch: codex/jobs-api-refresh-v1.

## Scope

- Four additive MySQL tables; no jobs-table changes or expiry column.
- US/GB/DE/AU × 20-category inventory evaluation, default upstream disabled.
- Global MySQL connection lock, persisted bucket leases, UTC budget reservations, cooldowns and a persistent 429 breaker.
- Reused existing normalization/source-hash/upsert implementation.
- New npm jobs:inventory and db:migrate:inventory commands.
- Authenticated inventory, refresh, budget and audit routes. Public routes stay MySQL-only.
- Public GET cache headers; no deployed Cloudflare cache rule or automatic purge.
- Separate public/internal OpenAPI documents and README files; example systemd service/timer only.

## Validation

- npm test: **51 passing tests** (17 backend, 34 ingestion).
- npm run build -w backend: passed.
- Both OpenAPI 3.1 documents validated using @apidevtools/swagger-parser.
- git diff --check: passed.
- Compared against the migration base: no frontend, deployment/Nginx, TLS, DNS or Worker changes.
- Corrected three inherited stale ingestion assertions: configuration already contained 12 countries and 1,629 query combinations, while tests expected 10/1,600. No legacy country/query generation behavior was changed.

Tests cover healthy/deficient inventory, disabled mode, cooldown and lease rejection, daily/monthly limits, admin reserve, charging failures, admission rollback, quota reservation before upstream work, global lock rejection, persistent 429 behavior across runs, source-hash dedupe/upsert, DE/AU normalization, public filters/cache TTLs, admin authentication/rate limiting, credential separation and public-document boundaries.

## Limits and rollout gates

No live JSearch calls, VPS changes, database migrations or service restarts were performed. MySQL adapter tests use controlled database doubles; actual SQL/migration/concurrent-connection integration must be verified against a disposable MySQL instance before production rollout. No local MySQL server was available for this implementation. No claim of live provider v5 verification is made; the adapter preserves the existing search-v2 contract and stays disabled by default.

The 160 monthly total includes a 40 admin reserve, so scheduled requests stop at 120 total usage. Provider billing-window alignment and shared-key consumption require reconciliation before enabling. Admin HTTP rate limiting is per process; global request locks/budgets are persistent. No automatic circuit reset or Cloudflare purge is supplied. Detailed manual deployment steps and environment defaults are in README-admin.md and ingestion/inventory/.env.example.

## Changed files

- `backend/src/__tests__/admin-inventory.test.ts`
- `backend/src/__tests__/public-spec.test.ts`
- `backend/src/app.ts`
- `backend/src/controllers/jobController.ts`
- `backend/src/middleware/errorHandler.ts`
- `backend/src/routes/admin.ts`
- `backend/src/services/categoryConfig.ts`
- `database/migrate-inventory.js`
- `database/migrations/002_inventory.sql`
- `docs/api/README-admin.md`
- `docs/api/README.md`
- `docs/api/architecture.md`
- `docs/api/implementation-report.md`
- `docs/api/openapi-admin.yaml`
- `docs/api/openapi-public.yaml`
- `docs/deploy/job-guide-match-inventory.service.example`
- `docs/deploy/job-guide-match-inventory.timer.example`
- `ingestion/__tests__/inventory.test.js`
- `ingestion/__tests__/phase2-config.test.js`
- `ingestion/inventory/.env.example`
- `ingestion/inventory/config.js`
- `ingestion/inventory/engine.js`
- `ingestion/inventory/run.js`
- `ingestion/inventory/runtime.js`
- `ingestion/inventory/store.js`
- `ingestion/src/country-utils.js`
- `package.json`
