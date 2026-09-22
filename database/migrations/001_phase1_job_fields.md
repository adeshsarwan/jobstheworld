# 001 Phase 1 Job Fields

This project uses `database/run-migrations.js` for an idempotent MySQL migration because the existing database must not be dropped, renamed, truncated, or replaced.

The migration reuses the existing `companies` and `jobs` tables and adds missing `jobs` columns only when they are absent:

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

It also backfills those fields from existing `raw_payload` and `location` values where possible, keeps `source_hash` uniqueness, and adds supporting indexes.
