# Internal inventory operations

**Internal only.** Import `openapi-admin.yaml` into a private SwaggerHub/Swagger Studio project. Never distribute this document or an admin credential with frontend configuration. The YAML uses explicit objects without anchors or aliases for editor compatibility. The public contract is separate.

`X-Admin-API-Key` is validated against server-side `JOBS_ADMIN_API_KEY`. It is a distinct credential from RAPIDAPI_KEY and from any developer credential issued elsewhere. Public routes have no credential; `X-API-Key` and Bearer credentials do not authorize admin routes. Missing configuration returns 503; absent/wrong credentials return 401. Authenticated admin operations share a 10-request/minute limit per Express process, returning 429 and Retry-After. Multiple backend processes each have their own HTTP limiter; persistent MySQL locks and request budgets remain shared across all processes. For a multi-process deployment add a shared ingress limiter before increasing process count.

All `/api/admin/jobs/*` responses, including errors, use `Cache-Control: no-store`:

- GET `/inventory`: recompute/persist all bucket counts, returning daily/admin eligibility, cooldowns and budget summary; no upstream requests.
- POST `/refresh`: JSON `{ "country": "DE", "category": "warehouse-logistics" }`; one explicit bucket, all gates enforced, no force option. Synchronous; allow at least 120 seconds. A 200 response can contain a skipped or busy result.
- GET `/budget`: persistent UTC-calendar monthly/daily usage and circuit state.
- GET `/audit?page=1&limit=20`: descending audit records, maximum 100 per page; contains no credentials or raw upstream payloads.

HTTP 429 from the admin API means its own rate limiter. An upstream 429 is recorded as a failed attempt, opens the persistent breaker, and stops remaining upstream requests. Reset is deliberately a reviewed database operation, not a public or admin HTTP override.

## Policy and accounting

The dedicated configuration example is `ingestion/inventory/.env.example`. Defaults: refresh disabled; monthly total 160, daily total 6, reserve 40 for admin, minimum cooldown 12 hours, concurrency 1, one page, zero automatic retries, 30-second spacing, minimum 20 usable jobs, minimum 5 fresh jobs, freshness window 3 days. Unsupported concurrency/pages/retry settings fail closed. Admin reserve is **inside** the 160 total: scheduled work stops at total usage 120; admin may use remaining capacity up to 160. The plan's remaining 40 requests are additional headroom, not automatically spendable. All attempts, including failed and indeterminate attempts, consume daily/monthly capacity.

Accounting uses UTC calendar days/months. Confirm the provider's subscription billing reset before activation; a provider billing month may differ. Counters cover this new system only. Historical calls, legacy scripts, manual clients, and other applications sharing the key are not automatically counted. Before enabling, reconcile externally consumed quota and conservatively seed counters, or wait for a verified reset. Never run legacy `npm run jobs:fetch` concurrently.

Priority configuration in `ingestion/inventory/config.js` defines US, GB, DE and AU. Each uses the 20 canonical categories and the first configured search phrase. This avoids expanding legacy ingestion queries or changing its schedule. Usable means exactly `active=1`; fresh additionally requires `posted_at` between now minus the configured window and now. Missing/future posting dates are not fresh. No verified reliable expiry field exists in the available contract evidence, so no expires_at migration or inferred deletion is introduced. Existing stale/removal behavior remains intact.

A MySQL connection-scoped GET_LOCK serializes new evaluator/admin work globally; an atomic transaction persists per-bucket leases, cooldowns, request reservations and budget charges before network I/O. Bucket leases last 15 minutes. A crash releases the connection lock but preserves the bucket cooldown and charge. A reserved/incomplete audit record means a request may or may not have reached the provider; do not automatically refund it. Connections use UTC. The next-request timestamp also persists spacing across runs. All clients must connect to the same MySQL server; this is not a multi-primary distributed lock.

Every evaluated skip is audited; each refresh uses at most one HTTP request and one audit row. Only allowlisted quota/reset headers and sanitized error codes are stored. A 429 breaker stays blocked even after an indicated reset until an operator verifies subscription/quota state. There are no retries. Healthy buckets never request upstream data. Public endpoints only query MySQL.

Search uses the existing `/search-v2` adapter with query/page/num_pages/date_posted. JSearch v5 contract verification is still outstanding; no claim of v5 compatibility or expiry support is made. Keep refresh disabled until contract and account quota are confirmed. No Job Details requests are made.

## Cache operations

The application emits shared-cache headers but does not deploy a Worker, install cache rules, or change DNS. Use the full canonical public query key documented in the public README. Explicitly bypass `/api/admin/*`, errors, non-GET methods and authenticated/personalized responses. The scheduler evaluates MySQL independently of cached public traffic.

There is no automated Cloudflare purge integration in this version. After successful refresh, public results can remain cached up to the documented TTL; this cannot cause upstream requests. For immediate visibility, an operator may purge known affected search/detail URLs using existing Cloudflare tooling. A future generation-key scheme can invalidate country/category families; never discard query dimensions to simplify purging. No Cloudflare credentials are needed by this implementation.

## Manual VPS deployment — NOT performed

1. Review this branch against `codex/cloudflare-workers-migration`. Back up the database and current backend/ingestion files. The VPS project is not a Git checkout: **do not git reset it or overwrite the frontend**. Transfer only reviewed backend, ingestion, database, and operational documentation changes. Preserve existing secrets. Do not deploy the branch's frontend files or replace the live frontend.
2. Harden `/home/adesh/test/.env` using `chmod 600 /home/adesh/test/.env`. Prepare `/etc/job-guide-match/ingestion.env`, owned by adesh:adesh, mode 0600, through an interactive editor. Include DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, RAPIDAPI_KEY, JOBS_ADMIN_API_KEY, and all configuration defaults. Keep JSEARCH_REFRESH_ENABLED=false. Do not put secrets on command lines.
3. Install reviewed dependencies using the existing deployment process. From the backend directory, `npm run build`. The shared inventory JS files must be present alongside backend/database/ingestion at their repository-relative paths.
4. Run **only** the additive inventory migration as adesh:

   ```sh
   cd /var/www/job-guide-match
   ENV_FILE=/etc/job-guide-match/ingestion.env npm run db:migrate:inventory
   ```

   It creates four new tables without rewriting jobs. Do not run legacy schema/backfill or ingestion commands for this release. DDL is idempotent but not transactional in MySQL; rerun after a partial failure. Ensure the application database user has required access. Revoke DDL permission from normal runtime credentials where operationally possible.
5. Ensure the backend receives `ENV_FILE=/etc/job-guide-match/ingestion.env` and the intended existing `PORT=43191`/CORS_ORIGIN. Unlike one-shot ingestion, an already running backend needs a planned restart to load a changed admin key/configuration. Make that change only during the separately approved deployment.
6. With refresh disabled, run `ENV_FILE=/etc/job-guide-match/ingestion.env npm run jobs:inventory`. Confirm 80 evaluated buckets, no request reservations, no budget usage. Test admin authentication, status, audit, and public filters.
7. After review, copy the example unit files to `/etc/systemd/system/job-guide-match-inventory.service` and `.timer`. They use adesh and ENV_FILE, and schedule 03:00 UTC plus up to ten minutes jitter. They are examples, not installed by any npm command.

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now job-guide-match-inventory.timer
   sudo systemctl list-timers job-guide-match-inventory.timer
   ```

8. Only after contract/quota reconciliation and explicit operational approval, enable upstream refresh in the dedicated env file. The next oneshot rereads it; update/restart backend configuration during the planned maintenance window so admin and scheduler use the same policy. Confirm MySQL stored posted_at timezone for old data before relying on freshness counts. No Nginx, TLS, DNS or active Worker branch change is needed.

To stop automatic upstream activity, disable the timer and set refresh false for all entry points. Preserve accounting/audit tables. Rolling back the backend does not require dropping the additive tables.

To clear a 429 block later, first disable all callers, verify the provider reset, reconcile counters and retain an audit/change record. Only then may an operator update jsearch_refresh_state.blocked; no automatic reset or enabling command is supplied here.

## Reviewed release packaging commands (manual only)

After reviewing the commit, on the local checkout:

```sh
git archive --format=tar.gz -o /tmp/jobstheworld-api-refresh.tar.gz codex/jobs-api-refresh-v1 \
  backend ingestion database package.json package-lock.json docs/api \
  docs/deploy/job-guide-match-inventory.service.example \
  docs/deploy/job-guide-match-inventory.timer.example
scp /tmp/jobstheworld-api-refresh.tar.gz adesh@172.236.151.195:/tmp/
```

During the separately approved VPS maintenance window:

```sh
# Make the backup private; it may contain existing environment files.
sudo install -d -m 0700 /root/jobstheworld-backups
sudo tar -czf /root/jobstheworld-backups/api-before-inventory-$(date +%Y%m%dT%H%M%S).tar.gz \
  -C /var/www/job-guide-match backend ingestion database package.json package-lock.json
# Take a database backup through the existing secure backup procedure too.
sudo -u adesh tar -xzf /tmp/jobstheworld-api-refresh.tar.gz -C /var/www/job-guide-match
cd /var/www/job-guide-match
npm ci --workspace backend --workspace ingestion --include-workspace-root --ignore-scripts
npm run build -w backend
ENV_FILE=/etc/job-guide-match/ingestion.env npm run db:migrate:inventory
ENV_FILE=/etc/job-guide-match/ingestion.env npm run jobs:inventory
```

The archive excludes frontend, Nginx, TLS, DNS and Worker configuration. It includes only tracked environment **examples**, not real secrets. Confirm existing backend/ingestion ownership permits extraction before proceeding. Keep the refresh switch false during migration and the first evaluation. Add the backend ENV_FILE override through `sudo systemctl edit job-guide-match-backend.service`, retaining the existing port and CORS settings, then use the approved maintenance window to run:

```sh
sudo systemctl daemon-reload
sudo systemctl restart job-guide-match-backend.service
curl --fail https://api.jobsthe.world/api/health
```

Once disabled-mode verification passes, install the timer examples:

```sh
sudo install -m 0644 docs/deploy/job-guide-match-inventory.service.example /etc/systemd/system/job-guide-match-inventory.service
sudo install -m 0644 docs/deploy/job-guide-match-inventory.timer.example /etc/systemd/system/job-guide-match-inventory.timer
sudo systemctl daemon-reload
sudo systemctl enable --now job-guide-match-inventory.timer
```

These are instructions only; none were executed as part of implementation. Enabling this timer while refresh remains false evaluates inventory without spending upstream quota.
