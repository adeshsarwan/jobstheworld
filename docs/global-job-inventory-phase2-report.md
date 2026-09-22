# Global Job Inventory Phase 2 Report

Date: July 25, 2026

## Summary

Implemented Job Guide Match Phase 2: Global Job Inventory Expansion.

No production deployment was performed. No Nginx, cron, or systemd configuration was modified or enabled. No database tables were truncated, reset, or replaced.

## Backups

Source backup:

`/home/adesh/job-guide-match-phase2-source-backup-20260725-184707.tar.gz`

Schema-only database backup:

`/home/adesh/job-guide-match-phase2-schema-backup-20260725-184707.sql`

Both backups were written with owner-only permissions.

## Files Created

- `ingestion/config/countries.js`
- `ingestion/config/categories.js`
- `ingestion/src/query-generator.js`
- `ingestion/src/query-settings.js`
- `ingestion/src/country-utils.js`
- `ingestion/src/query-sync.js`
- `ingestion/src/coverage-report.js`
- `ingestion/src/query-stats.js`
- `ingestion/__tests__/phase2-config.test.js`
- `docs/global-job-inventory-phase2-report.md`

## Files Changed

- `package.json`
- `database/run-migrations.js`
- `ingestion/package.json`
- `ingestion/.env.example`
- `ingestion/fetch-jobs.js`
- `ingestion/src/job-normalizer.js`
- `ingestion/src/persist-job.js`
- `ingestion/__tests__/dedupe.test.js`
- `backend/src/services/categoryConfig.ts`
- `backend/src/services/jobService.ts`
- `backend/src/controllers/jobController.ts`
- `backend/src/repositories/jobRepository.ts`
- `backend/src/__tests__/job-api.test.ts`
- `frontend/src/components/ResultsClient.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api.ts`
- `frontend/next.config.mjs`

## Database Migrations Applied

Added additive, idempotent migration support for:

- `job_ingestion_queries`
- `idx_jobs_active`
- `idx_jobs_country`
- `idx_jobs_posted_at`
- `uq_jobs_source_hash_only`

Verified existing required job indexes:

- source hash uniqueness
- active
- country
- category
- posted_at
- last_seen_at
- company_id

No existing tables were dropped or renamed.

## Query Configuration

Configured countries:

- US
- GB
- CA
- IN
- AE
- SA
- QA
- KW
- OM
- BH

Configured categories:

- 20 categories
- 8 search phrases per category

Generated query combinations:

- 10 countries x 20 categories x 8 phrases = 1,600

Query rows created:

- `job_ingestion_queries`: 1,600
- enabled rows: 1,600

Query sync idempotency:

- Second sync preserved 1,600 rows
- Existing run statistics remained intact: 10 query runs, 10 successes, 191 saved jobs

## Counts

Before Phase 2 controlled fetch:

- companies: 146
- jobs: 321
- active jobs: 321

After Phase 2 controlled fetch:

- companies: 256
- jobs: 512
- active jobs: 512

## Controlled Fetch

Command:

```bash
JOB_QUERY_BATCH_SIZE=10 npm run jobs:fetch
```

Summary:

- selected queries: 10
- successful queries: 10
- failed queries: 0
- jobs returned: 191
- new jobs inserted: 191
- existing jobs updated: 0
- jobs failed: 0
- total duration: 84s

Country summary:

- US: 10 queries, 191 returned, 191 inserted, 0 updated

No full 40-query fetch was run during implementation.

## Coverage

Coverage command:

```bash
npm run jobs:coverage
```

Coverage summary:

- total active jobs: 512
- jobs added in last 24 hours: 512
- jobs added in last 7 days: 512
- jobs with NULL country: 0
- jobs with NULL category: 0

Active jobs by country:

- US: 512

Top active categories:

- warehouse-logistics: 172
- remote_tech: 60
- retail-store: 59
- blue_collar: 31
- driving-delivery: 20
- food-service: 20
- cleaning-facilities: 20
- healthcare-care: 20
- hospitality: 20
- security: 20
- remote-work-from-home: 20
- office-admin: 20
- customer-service: 20
- travel: 10

## Query Performance

Query stats command:

```bash
npm run jobs:query-stats
```

Summary:

- total configured queries: 1,600
- enabled queries: 1,600
- queries never run: 1,590
- queries currently due: 1,590
- successful query runs: 10
- failed query runs: 0
- average jobs saved per query run: 19.10
- API query success rate: 100.00%

## Tests

Command:

```bash
npm test
```

Results:

- backend: 7 tests passed
- ingestion: 10 tests passed
- total: 17 tests passed

Focused coverage includes:

- exactly 10 countries
- exactly 20 categories
- exactly 1,600 generated queries
- query text format
- idempotent query sync
- batch size default and cap
- concurrency default and cap
- source hash update behavior
- country normalization
- country API filtering
- category API filtering
- inactive jobs excluded
- next-run scheduling rules

## Build Results

Command:

```bash
npm run build
```

Results:

- backend TypeScript build passed
- frontend production build passed
- existing routes still build, including guided flow and results pages

## API Smoke Tests

Verified:

- `GET /api/jobs?country=US&category=warehouse-logistics&limit=2`
- `GET /api/categories`
- `POST /api/match`
- frontend host proxy: `GET http://127.0.0.1:3001/api/jobs?country=US&limit=1`
- guided flow page: `GET /find/work`
- results page: `GET /find/results`

Smoke results:

- country/category API filter returned only US warehouse-logistics rows
- categories API returned 20 configured categories
- match endpoint accepted `country: "US"` and returned matching jobs
- frontend `/api` proxy returned jobs successfully

## Cleanup Dry Run

Command:

```bash
npm run jobs:cleanup:dry
```

Result:

- 0 stale jobs would be marked inactive
- no jobs were deleted
- no jobs were deactivated

## Frontend

Added a small optional country selector on the existing results page only.

Country options are exactly:

- All supported countries
- United States
- United Kingdom
- Canada
- India
- United Arab Emirates
- Saudi Arabia
- Qatar
- Kuwait
- Oman
- Bahrain

No page was redesigned. No new page was added. No geolocation, autocomplete, maps, or location detection was added.

## Unresolved Issues

- Existing historical categories such as `remote_tech`, `blue_collar`, and `travel` remain in the jobs table from Phase 1 ingestion. They were not deleted or rewritten.
- Only the controlled 10-query verification fetch was run, so current live coverage is US-only until scheduled fetches continue through the remaining due queries.

## Rollback Instructions

Source rollback:

1. Stop temporary local Node processes if they are running.
2. Move `/var/www/job-guide-match` aside.
3. Restore from `/home/adesh/job-guide-match-phase2-source-backup-20260725-184707.tar.gz`.

Schema rollback:

- A schema-only backup exists at `/home/adesh/job-guide-match-phase2-schema-backup-20260725-184707.sql`.
- The migration was additive.
- Do not drop columns, indexes, or tables without taking a full database backup first.
- To stop Phase 2 fetches without deleting anything, set `enabled = 0` on selected `job_ingestion_queries` rows after review.

## Recommended Cron Entries

Documented only. Not installed.

Fetch every 30 minutes:

```cron
*/30 * * * * cd /var/www/job-guide-match && npm run jobs:fetch >> /var/log/job-guide-match-fetch.log 2>&1
```

Query sync once daily:

```cron
15 2 * * * cd /var/www/job-guide-match && npm run jobs:queries:sync >> /var/log/job-guide-match-query-sync.log 2>&1
```

Cleanup dry-run once daily:

```cron
45 2 * * * cd /var/www/job-guide-match && npm run jobs:cleanup:dry >> /var/log/job-guide-match-cleanup-dry.log 2>&1
```
