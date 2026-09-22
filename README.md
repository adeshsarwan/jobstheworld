# Job Guide Match

Job Guide Match is a small three-part application:

- `frontend`: Next.js pages for search, guided matching, chat, and job detail pages.
- `backend`: Express API that reads real jobs from MySQL.
- `ingestion`: adapted Node.js fetch and cleanup scripts for the existing jobs database.

The frontend never connects to MySQL directly. It calls the backend API.

## Setup

```bash
npm install
npm run db:migrate
```

The app reads environment variables from `.env` when present. On the current server it also falls back to the existing `/home/adesh/test/.env` so the new app can use the same MySQL database without copying secrets.

## Run Locally

```bash
npm run dev:backend
npm run dev:frontend
```

Default local URLs:

- Backend: `http://localhost:4000`
- Frontend: `http://localhost:3000`

## Ingestion

```bash
npm run jobs:fetch
npm run jobs:cleanup:dry
npm run jobs:cleanup
```

Fetch updates `last_seen_at` and never deletes jobs. Cleanup marks stale jobs inactive and does not permanently delete rows.

## Validation

```bash
npm test
npm run build
```
