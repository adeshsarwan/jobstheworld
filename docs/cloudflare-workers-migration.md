# Cloudflare Workers migration

## Target architecture

Browser -> Cloudflare Worker (Next.js frontend) -> api.jobsthe.world -> VPS Express -> MySQL

JSearch/RapidAPI ingestion remains on the VPS and continues populating MySQL.

## Safety

Do not change the existing apex or www DNS records until the Worker preview has been tested. The current VPS deployment remains the production rollback path during migration.

## VPS API hostname

Create a dedicated origin hostname for the Express API. The intended public API endpoint is:

https://api.jobsthe.world

Configure Nginx so this hostname proxies to the existing Express process on 127.0.0.1:43191. Keep MySQL private and do not expose port 3306.

Set the backend production CORS origin to:

https://jobsthe.world

The frontend is configured to use api.jobsthe.world for server-side requests. Browser-side requests continue to use same-origin /api routes, which the Next.js rewrite forwards to the API hostname.

## Cloudflare build

The frontend uses OpenNext for Cloudflare Workers.

From the repository root:

npm install
npm run build -w frontend
npm run build:cloudflare -w frontend

For a Cloudflare preview:

npm run preview:cloudflare -w frontend

For deployment:

npm run deploy:cloudflare -w frontend

## Cloudflare Git integration

Connect the GitHub repository adeshsarwan/jobstheworld.

Production branch: main

Root directory: frontend

Build command:

npm run build:cloudflare

Deploy command:

npx wrangler deploy

Before making main production, first deploy and validate the migration branch codex/cloudflare-workers-migration.

## Cutover checklist

1. Verify Worker preview/home page.
2. Verify /ads.txt.
3. Verify /api/jobs through the Worker.
4. Verify search and pagination.
5. Verify guided matching.
6. Verify chat.
7. Verify individual job pages.
8. Verify company pages.
9. Verify Thebes native/anchor/interstitial/rewarded integrations.
10. Verify api.jobsthe.world reaches only the Express backend.
11. Attach jobsthe.world and www.jobsthe.world to the Worker.
12. Confirm HTTPS and redirects.
13. Only after production verification, remove the old apex A record pointing jobsthe.world to 172.236.151.195.

The VPS should continue running MySQL, Express, ingestion, and cron jobs after frontend cutover.
