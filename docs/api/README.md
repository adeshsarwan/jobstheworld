# JobsTheWorld public API

Frontend base URL: **https://api.jobsthe.world**.

Import `openapi-public.yaml` into SwaggerHub or Swagger Studio. This OpenAPI 3.1 document is intended for external/frontend developers. All listed endpoints are public and require no developer credential. The YAML is exported without anchors or aliases for editor compatibility; replace the entire editor document when updating it.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Availability |
| GET | `/api/jobs` | Legacy search (unchanged) |
| GET | `/api/jobs/search` | Normalized stored job search |
| GET | `/api/jobs/{slug}` | Job details and application URL |
| GET | `/api/categories` | Canonical category choices |
| POST | `/api/match` | Guided answer matching |
| POST | `/api/chat` | Guided question flow |

Legacy `/api/jobs` accepts `country`, `category`, `q`, `city`, `state`, `remote`, `employment_type`, `experience_level`, `page`, and `limit`. Country codes include US, GB, DE and AU. `page` defaults to 1; `limit` defaults to 20 and is capped at 100. Matching defaults to 10 results. Country and category matching preserve existing aliases and behavior; unknown country/category values currently omit that filter. Remote accepts true/1/yes/remote and false/0/no. Employment and experience filters preserve the existing normalization rules described in the specification.

```http
GET /api/jobs?country=DE&category=warehouse-logistics&city=Berlin&page=1&limit=20
```

```json
{"success":true,"data":{"jobs":[],"pagination":{"page":1,"limit":20,"total":0,"totalPages":1}}}
```

Job details include `applyUrl`. List results omit the description and application URL. A job is available when its stored active flag is set; there is no published expiry guarantee. Category counts currently remain zero placeholders. Invalid pagination returns 400; unavailable job slugs return 404. Errors use `{"success":false,"error":"Invalid request"}`.

Successful job-search responses permit shared-cache TTLs of 30 minutes for country/category searches, 15 minutes when city/state is supplied, and 5 minutes for free-text searches. Job details permit one hour. Browser `max-age` is zero. Errors are not cacheable. Only successful GET responses should be cached; POST responses should not be cached.

A cache key must include the path and **all** response-affecting query parameters: country, category, q, city, state, remote, employment_type, experience_level, page, limit. Retain both category and q when both are supplied. Sort parameter names for canonical ordering; retain values exactly unless normalization is proven equivalent. Include the response's `Vary` dimensions, including Origin. Do not configure a cache rule that ignores query strings.

These TTLs are an upper bound on staleness, not a guarantee that edge caching is enabled. The frontend should request the API hostname directly. CORS must allow the frontend's deployed origin.

The new `/api/jobs/search` accepts the same parameter names with strict validation. It reads active stored jobs and returns the existing Job model in `{"success":true,"data":{"jobs":[],"pagination":{"page":1,"limit":20,"total":0,"totalPages":0}}}`. Results sort by `posted_at DESC, id DESC`, with null dates last. Ordering is stable for unchanged data; concurrent changes can shift offset pagination.

```http
GET /api/jobs/search?country=US&category=warehouse-logistics&page=1&limit=20
GET /api/jobs/search?country=US&q=customer%20service&remote=true&page=1&limit=20
GET /api/jobs/search?country=US&city=New%20York&employment_type=Full-time&page=1&limit=20
```

Country must be an assigned ISO-2 code and is uppercased. Categories accept canonical values, labels and existing aliases, and match mapped stored categories without keyword expansion. Strings are trimmed, nonempty and at most 200 characters. Remote accepts only true/false/1/0 (case-insensitive). Employment accepts Full-time, Part-time, Contract, Internship or Temporary (case-insensitive). Experience accepts entry-level, mid-level or senior; these are title/description keyword approximations, detailed in the specification. Text searches use SQL LIKE semantics, including percent and underscore wildcards.

Page defaults to 1, limit to 20. Both require decimal integer strings; page must be positive, limit 1–100, and the computed offset must be a safe integer. Unknown parameters, duplicate parameters and invalid values return `400` with `{"success":false,"error":"Invalid request"}` and `Cache-Control: no-store`.

For the new route, shared-cache TTL is 300 seconds for q, otherwise 900 for city/state, otherwise 1800 for country/category, otherwise a conservative 300 seconds (including searches using only remote/employment/experience). Browser max-age is zero and must-revalidate is set. Cache identity is the full request URL, including all ten parameters listed above, plus Vary dimensions. No application result cache is used. These headers do not create a Cloudflare cache rule: any edge rule must preserve the entire query string and must never cache errors.

The new route is a repository contract pending deployment. The response example contains a sanitized real stored job; its one-row dataset and pagination are illustrative, not a claim about current inventory.
