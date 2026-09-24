import categories from "../config/categories.js";
import { markets, decision, rank } from "./config.js";
const allowedHeaders = new Set([
  "retry-after",
  "x-ratelimit-requests-limit",
  "x-ratelimit-requests-remaining",
  "x-ratelimit-requests-reset",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);
export function safeHeaders(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    if (
      allowedHeaders.has(key.toLowerCase()) &&
      /^[\d .,:+A-Za-z/-]{1,100}$/.test(value)
    )
      out[key.toLowerCase()] = value;
  }
  return out;
}
export async function search(query, key) {
  const url = new URL("https://jsearch.p.rapidapi.com/search-v2");
  url.search = new URLSearchParams({
    query,
    page: "1",
    num_pages: "1",
    date_posted: "all",
  }).toString();
  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  const headers = safeHeaders(response.headers);
  if (!response.ok) return { status: response.status, headers, jobs: [] };
  let body;
  try {
    body = await response.json();
  } catch {
    return { status: response.status, headers, jobs: [], invalid: true };
  }
  const jobs = Array.isArray(body?.data?.jobs) ? body.data.jobs : body.data;
  if (!Array.isArray(jobs))
    return { status: response.status, headers, jobs: [], invalid: true };
  return { status: response.status, headers, jobs };
}
export async function runInventory({
  store,
  c,
  key,
  save,
  request = search,
  trigger = "daily",
  selection,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  if (!["daily", "admin"].includes(trigger)) throw new Error("Invalid trigger");
  if (
    selection &&
    (!markets[selection.country] ||
      !categories.some((c) => c.slug === selection.category))
  )
    throw new Error("Invalid bucket");
  if (!(await store.acquire())) return { status: "busy", decisions: [] };
  const decisions = [];
  try {
    let buckets = await store.evaluate();
    if (selection)
      buckets = buckets.filter(
        (b) =>
          b.country_code === selection.country &&
          b.category_slug === selection.category,
      );
    for (const b of buckets.sort(rank)) {
      const category = categories.find((c) => c.slug === b.category_slug);
      const query = `${category.queries[0]} jobs in ${markets[b.country_code]}`;
      let state = await store.state();
      let reason = decision(b, c, state, trigger);
      if (reason === "eligible" && !key?.trim()) reason = "missing_key";
      if (reason !== "eligible") {
        await store.audit(b, trigger, reason, query);
        decisions.push({
          country: b.country_code,
          category: b.category_slug,
          reason,
        });
        continue;
      }
      if (state.next_request_at)
        await sleep(Math.max(0, new Date(state.next_request_at) - Date.now()));
      const reservation = await store.reserve(b, trigger, query);
      if (!reservation.id) {
        await store.audit(b, trigger, reservation.reason, query);
        decisions.push({
          country: b.country_code,
          category: b.category_slug,
          reason: reservation.reason,
        });
        continue;
      }
      const result = {
        httpStatus: null,
        headers: {},
        returned: 0,
        inserted: 0,
        updated: 0,
        failed: 0,
        status: "error",
        error: null,
      };
      try {
        const response = await request(query, key);
        result.httpStatus = response.status;
        result.headers = response.headers;
        if (response.status === 429) {
          result.error = "HTTP 429: circuit opened";
        } else if (response.status < 200 || response.status >= 300)
          result.error = `HTTP ${response.status}`;
        else if (response.invalid) result.error = "Invalid upstream response";
        else {
          result.returned = response.jobs.length;
          for (const raw of response.jobs) {
            try {
              const saved = await save(raw, {
                countryCode: b.country_code,
                categorySlug: b.category_slug,
              });
              if (saved.status === "inserted") result.inserted++;
              else if (saved.status === "updated") result.updated++;
              else result.failed++;
            } catch {
              result.failed++;
            }
          }
          result.status = result.failed ? "partial" : "success";
          if (result.failed)
            result.error = "One or more jobs could not be persisted";
        }
      } catch {
        result.error = "Upstream or persistence operation failed";
      }
      // Failure to persist the breaker must abort the run, not permit another call.
      if (result.httpStatus === 429) await store.block(result.headers);
      await store.finish(reservation.id, b, result);
      decisions.push({
        country: b.country_code,
        category: b.category_slug,
        reason: result.status,
        auditId: reservation.id,
      });
      if (result.httpStatus === 429) break;
    }
    await store.evaluate();
    return { status: "complete", decisions };
  } finally {
    await store.release();
  }
}
