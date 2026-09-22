# Job Guide Match Implementation Report

Date: July 25, 2026

## What Was Created

Created `/var/www/job-guide-match` with:

- `frontend`: Next.js + TypeScript app
- `backend`: Express + TypeScript API
- `ingestion`: adapted Node.js job fetch and cleanup scripts
- `database`: idempotent MySQL migration script
- `docs`: deployment examples and this report
- root `package.json` using npm workspaces
- `.gitignore`
- `README.md`

No admin panel, auth, queue, Docker, Redis, AI integration, or deployment activation was added.

## Source Backup

Existing ingestion source from `/home/adesh/test` was backed up before the new project was installed:

`/home/adesh/job-guide-match-source-backup-20260725-180054.tar.gz`

The backup excludes `node_modules` and old zip artifacts.

## Database Changes

The existing `companies` and `jobs` tables were reused. No tables were dropped, renamed, truncated, or replaced.

The idempotent migration added missing `jobs` columns:

- `slug`
- `city`
- `state`
- `country`
- `employment_type`
- `is_remote`
- `salary_period`
- `posted_at`
- `active`
- `removed_at`

The migration also backfilled 101 existing job rows where useful and added supporting indexes, including `uq_jobs_slug` and filter indexes. Existing `source_hash` uniqueness remains in place.

## Row Counts

Before changes:

- companies: 48
- jobs: 101

After migration:

- companies: 48
- jobs: 101
- active jobs: 101
- inactive jobs: 0

After two real fetch runs:

- companies: 146
- jobs: 321
- active jobs: 321
- inactive jobs: 0
- duplicate source-hash rows: 0

The second fetch returned additional unique source IDs from JSearch, so the total increased. The duplicate source-hash check remained clean.

## Test Results

Command: `npm test`

- backend: 5 tests passed
- ingestion: 1 test passed
- total: 6 tests passed

Covered:

- job API pagination
- job filters
- inactive jobs excluded
- match endpoint returns matching jobs
- job detail endpoint
- repeat fetch dedupe behavior for identical source jobs

## Ingestion Verification

Command: `npm run jobs:fetch`

Run 1:

- 11 successful query groups
- 0 failed query groups
- 110 saved jobs
- 0 skipped jobs
- 0 failed jobs

Run 2:

- 11 successful query groups
- 0 failed query groups
- 110 saved jobs
- 0 skipped jobs
- 0 failed jobs

Command: `npm run jobs:cleanup:dry`

- 0 stale jobs would be marked inactive
- no jobs were deleted

## API Verification

Backend local URL: `http://127.0.0.1:4000`

Verified:

- `GET /api/health`: success
- `GET /api/jobs?limit=3`: success, total 321
- `GET /api/jobs/:slug`: success
- `POST /api/match`: success, returned real jobs
- `POST /api/chat`: success, returned real jobs

Final smoke result:

- jobs total: 321
- match total for remote/work-from-home flow: 99
- chat total for the same answers: 99

## Build Results

Command: `npm run build`

- backend TypeScript build passed
- frontend production build passed
- Next.js generated the requested routes:
  - `/`
  - `/chat`
  - `/find/work`
  - `/find/location`
  - `/find/schedule`
  - `/find/experience`
  - `/find/results`
  - `/jobs/[slug]`

## How To Run

From `/var/www/job-guide-match`:

Backend:

```bash
npm run start -w backend
```

Frontend:

```bash
PORT=3001 npm run start -w frontend
```

Port 3000 was already occupied during verification, so the frontend was started on port 3001.

Ingestion:

```bash
npm run jobs:fetch
npm run jobs:cleanup:dry
npm run jobs:cleanup
```

## Deployment Preparation

Examples were written but not enabled:

- `docs/deploy/backend.service.example`
- `docs/deploy/frontend.service.example`
- `docs/deploy/cron.example`
- `docs/deploy/nginx.example.conf`

No nginx config was changed. No systemd service was enabled.

## Rollback Notes

Source rollback:

1. Stop any local Node processes that were started for verification.
2. Move or archive `/var/www/job-guide-match`.
3. Restore the previous ingestion source from `/home/adesh/job-guide-match-source-backup-20260725-180054.tar.gz` if needed.

Database rollback:

- The database changes were additive.
- No destructive rollback was run.
- Avoid dropping columns or deleting rows without taking a database backup first.
- To hide newly stale or unwanted jobs without deleting them, set `active = 0` and `removed_at = NOW()` for the reviewed rows.
