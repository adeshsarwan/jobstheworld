export const markets = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  AU: "Australia",
};
export function config(env = process.env) {
  const integer = (name, fallback, min = 0, max = 10000) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(n) || n < min || n > max)
      throw new Error(`Invalid ${name}`);
    return n;
  };
  if (!["false", "true"].includes(env.JSEARCH_REFRESH_ENABLED ?? "false"))
    throw new Error("Invalid JSEARCH_REFRESH_ENABLED");
  const c = {
    enabled: env.JSEARCH_REFRESH_ENABLED === "true",
    monthly: integer("JSEARCH_MONTHLY_BUDGET", 160, 0, 200),
    daily: integer("JSEARCH_DAILY_BUDGET", 6, 0, 200),
    reserve: integer("JSEARCH_ADMIN_RESERVE", 40, 0, 200),
    cooldown: integer("JSEARCH_MIN_REFRESH_HOURS", 12, 12, 8760),
    usable: integer("MIN_USABLE_JOBS", 20, 1),
    fresh: integer("MIN_FRESH_JOBS", 5, 1),
    days: integer("FRESH_WINDOW_DAYS", 3, 1, 365),
    throttle: integer("JSEARCH_THROTTLE_MS", 30000, 30000, 3600000),
  };
  if (c.reserve > c.monthly)
    throw new Error("Admin reserve exceeds monthly budget");
  for (const [key, value] of [
    ["JSEARCH_CONCURRENCY", 1],
    ["JSEARCH_PAGES_PER_REQUEST", 1],
    ["JSEARCH_AUTOMATIC_RETRIES", 0],
  ]) {
    if (integer(key, value) !== value)
      throw new Error(`${key} must be ${value}`);
  }
  return c;
}
export function decision(bucket, c, state, trigger, now = new Date()) {
  if (bucket.usable_count >= c.usable && bucket.fresh_3d_count >= c.fresh)
    return "healthy";
  if (!c.enabled) return "disabled";
  if (state.blocked) return "circuit_open";
  if (bucket.lock_until && new Date(bucket.lock_until) > now) return "locked";
  if (bucket.cooldown_until && new Date(bucket.cooldown_until) > now)
    return "cooldown";
  if (state.month >= c.monthly) return "monthly_budget";
  if (trigger === "daily" && state.month >= c.monthly - c.reserve)
    return "admin_reserve";
  if (state.day >= c.daily) return "daily_budget";
  return "eligible";
}
export function rank(a, b) {
  return (
    a.usable_count - b.usable_count ||
    a.fresh_3d_count - b.fresh_3d_count ||
    new Date(a.last_refresh_success_at || 0) -
      new Date(b.last_refresh_success_at || 0) ||
    `${a.country_code}:${a.category_slug}`.localeCompare(
      `${b.country_code}:${b.category_slug}`,
    )
  );
}
