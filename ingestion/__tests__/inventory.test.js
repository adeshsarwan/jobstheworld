import { describe, it, expect, vi } from "vitest";
import { config, decision, rank } from "../inventory/config.js";
import { runInventory, safeHeaders } from "../inventory/engine.js";
import { MysqlInventoryStore } from "../inventory/store.js";
const bucket = (extra = {}) => ({
  country_code: "US",
  category_slug: "warehouse-logistics",
  usable_count: 0,
  fresh_3d_count: 0,
  cooldown_until: null,
  ...extra,
});
const enabled = () => config({ JSEARCH_REFRESH_ENABLED: "true" });
function fixture(
  buckets = [bucket()],
  c = enabled(),
  state = { month: 0, day: 0, blocked: false },
) {
  const store = {
    acquire: vi.fn(async () => true),
    release: vi.fn(async () => {}),
    evaluate: vi.fn(async () => buckets),
    state: vi.fn(async () => state),
    audit: vi.fn(async () => 1),
    reserve: vi.fn(async (b, t) => {
      const r = decision(b, c, state, t);
      if (r !== "eligible") return { reason: r };
      state.month++;
      state.day++;
      return { id: state.month };
    }),
    block: vi.fn(async () => {
      state.blocked = true;
    }),
    finish: vi.fn(async () => {}),
  };
  const request = vi.fn(async () => ({
    status: 200,
    headers: {},
    jobs: [{ job_id: "a" }],
  }));
  const save = vi.fn(async () => ({ status: "inserted" }));
  return {
    store,
    request,
    save,
    c,
    key: "test-placeholder",
    sleep: vi.fn(async () => {}),
  };
}
describe("inventory policy and engine", () => {
  it.each([
    ["healthy", bucket({ usable_count: 20, fresh_3d_count: 5 }), {}, {}],
    ["cooldown", bucket({ cooldown_until: "2999-01-01" }), {}, {}],
    ["locked", bucket({ lock_until: "2999-01-01" }), {}, {}],
    ["daily_budget", bucket(), {}, { day: 6 }],
    ["monthly_budget", bucket(), {}, { month: 160 }],
    ["admin_reserve", bucket(), {}, { month: 120 }],
    ["circuit_open", bucket(), {}, { blocked: true }],
    ["disabled", bucket(), { enabled: false }, {}],
  ])("%s makes zero upstream requests", async (reason, b, overrides, state) => {
    const f = fixture(
      [b],
      { ...enabled(), ...overrides },
      { month: 0, day: 0, blocked: false, ...state },
    );
    const result = await runInventory(f);
    expect(f.request).not.toHaveBeenCalled();
    expect(result.decisions[0].reason).toBe(reason);
  });
  it.each([
    bucket({ usable_count: 19, fresh_3d_count: 5 }),
    bucket({ usable_count: 20, fresh_3d_count: 4 }),
  ])("refreshes a deficient bucket", async (b) => {
    const f = fixture([b]);
    await runInventory(f);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.save).toHaveBeenCalledTimes(1);
  });
  it("defaults disabled and rejects unsafe concurrency/retries", () => {
    expect(config({}).enabled).toBe(false);
    expect(() => config({ JSEARCH_CONCURRENCY: "2" })).toThrow();
    expect(() => config({ JSEARCH_AUTOMATIC_RETRIES: "1" })).toThrow();
  });
  it("admin can use reserved capacity but cannot exceed monthly total", async () => {
    const f = fixture([bucket()], enabled(), {
      month: 120,
      day: 0,
      blocked: false,
    });
    await runInventory({ ...f, trigger: "admin" });
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(decision(bucket(), enabled(), { month: 160, day: 0 }, "admin")).toBe(
      "monthly_budget",
    );
  });
  it("persistent lock contention prevents any refresh", async () => {
    const db = { query: vi.fn(async () => [[{ acquired: 0 }]]) };
    const f = fixture();
    f.store = new MysqlInventoryStore(db, enabled());
    expect((await runInventory(f)).status).toBe("busy");
    expect(f.request).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).toContain("GET_LOCK");
  });
  it("429 persists a breaker, is audited, stops the run, and blocks later runs", async () => {
    const f = fixture([bucket(), bucket({ country_code: "GB" })]);
    f.request.mockResolvedValue({
      status: 429,
      headers: { "retry-after": "3600" },
      jobs: [],
    });
    await runInventory(f);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.store.block).toHaveBeenCalled();
    expect(f.store.finish.mock.calls[0][2].httpStatus).toBe(429);
    await runInventory(f);
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it("charges failed requests and enforces budget within a run", async () => {
    const f = fixture([bucket(), bucket({ country_code: "GB" })], enabled(), {
      month: 0,
      day: 5,
      blocked: false,
    });
    f.request.mockRejectedValue(new Error("secret-do-not-log"));
    const result = await runInventory(f);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.store.finish.mock.calls)).not.toContain(
      "secret-do-not-log",
    );
    expect(result.decisions[1].reason).toBe("daily_budget");
  });
  it("sorts zero/low inventory, freshness and oldest success first", () => {
    const a = bucket({ usable_count: 20 }),
      b = bucket({ usable_count: 0 }),
      c = bucket({ usable_count: 1 });
    expect([a, c, b].sort(rank)).toEqual([b, c, a]);
  });
  it("only retains allowlisted quota headers", () => {
    expect(
      safeHeaders(
        new Headers({
          "X-RapidAPI-Key": "secret",
          "retry-after": "60",
          "set-cookie": "secret",
        }),
      ),
    ).toEqual({ "retry-after": "60" });
  });
});
describe("persistent admission adapter", () => {
  it("charges both periods and commits before network I/O", async () => {
    const calls = [];
    const db = {
      query: vi.fn(async (sql) => {
        calls.push(sql);
        return [[]];
      }),
      execute: vi.fn(async (sql) => {
        calls.push(sql);
        if (sql.startsWith("SELECT *")) return [[bucket()]];
        return [{ insertId: 42 }];
      }),
      beginTransaction: vi.fn(async () => calls.push("begin")),
      commit: vi.fn(async () => calls.push("commit")),
      rollback: vi.fn(async () => calls.push("rollback")),
    };
    const store = new MysqlInventoryStore(db, enabled());
    store.state = async () => ({ month: 0, day: 0, blocked: false });
    expect(await store.reserve(bucket(), "daily", "warehouse jobs")).toEqual({
      id: 42,
    });
    expect(calls.find((s) => s.includes("jsearch_request_budgets"))).toContain(
      "request_count=request_count+1",
    );
    expect(calls.some((s) => s.includes("FOR UPDATE"))).toBe(true);
    expect(calls.some((s) => s.includes("upstream_request_count=1"))).toBe(
      true,
    );
    expect(calls.at(-1)).toBe("commit");
  });
  it("rechecks persisted cooldown after admission and never debits on rejection", async () => {
    const db = {
      execute: vi.fn(async () => [[bucket({ cooldown_until: "2999-01-01" })]]),
      beginTransaction: vi.fn(),
      rollback: vi.fn(),
      commit: vi.fn(),
    };
    const store = new MysqlInventoryStore(db, enabled());
    store.state = async () => ({ month: 0, day: 0, blocked: false });
    expect(await store.reserve(bucket(), "admin", "q")).toEqual({
      reason: "cooldown",
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.rollback).toHaveBeenCalled();
    expect(db.commit).not.toHaveBeenCalled();
  });
  it("rolls back failed reservations", async () => {
    const db = {
      execute: vi.fn(async () => {
        throw new Error("db unavailable");
      }),
      beginTransaction: vi.fn(),
      rollback: vi.fn(),
    };
    const store = new MysqlInventoryStore(db, enabled());
    await expect(store.reserve(bucket(), "daily", "q")).rejects.toThrow();
    expect(db.rollback).toHaveBeenCalled();
  });
});
describe("configuration boundaries and reservation failures", () => {
  it("refuses invalid budget settings and preserves hard plan cap", () => {
    expect(() => config({ JSEARCH_MONTHLY_BUDGET: "201" })).toThrow();
    expect(() =>
      config({ JSEARCH_MONTHLY_BUDGET: "20", JSEARCH_ADMIN_RESERVE: "40" }),
    ).toThrow();
    expect(() => config({ JSEARCH_MIN_REFRESH_HOURS: "1" })).toThrow();
  });
  it("does not call upstream if reservation fails and releases the lock", async () => {
    const f = fixture();
    f.store.reserve.mockRejectedValue(new Error("reservation failed"));
    await expect(runInventory(f)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.store.release).toHaveBeenCalledTimes(1);
  });
  it("does not call upstream when key is absent", async () => {
    const f = fixture();
    const result = await runInventory({ ...f, key: "" });
    expect(f.request).not.toHaveBeenCalled();
    expect(result.decisions[0].reason).toBe("missing_key");
  });
  it("maintains DE and AU query/normalization coverage", async () => {
    const { markets } = await import("../inventory/config.js");
    const { normalizeJob } = await import("../src/job-normalizer.js");
    for (const [country, name] of [
      ["DE", "Germany"],
      ["AU", "Australia"],
    ]) {
      expect(markets[country]).toBe(name);
      expect(
        normalizeJob(
          { job_id: "example", job_country: name },
          { countryCode: country, categorySlug: "technology" },
        ).country,
      ).toBe(country);
    }
  });
});
