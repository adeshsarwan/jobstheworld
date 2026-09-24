import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { JobService } from "../services/jobService.js";
describe("admin boundaries and public cache", () => {
  const setup = () => {
    const operation = vi.fn(async () => ({ status: "complete" }));
    const repo = {
      findJobs: vi.fn(async () => ({
        jobs: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
      })),
      findJobBySlug: vi.fn(async () => null),
      findCategories: vi.fn(async () => []),
    };
    return {
      operation,
      repo,
      app: createApp({
        jobService: new JobService(repo),
        inventoryOperation: operation,
        adminKey: "test-only-key",
      }),
    };
  };
  it("requires admin authentication and never caches failures", async () => {
    const { app, operation } = setup();
    const res = await request(app).get("/api/admin/jobs/inventory");
    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(operation).not.toHaveBeenCalled();
  });
  it("rate limits authenticated admin requests", async () => {
    const { app } = setup();
    for (let i = 0; i < 10; i++)
      expect(
        (
          await request(app)
            .get("/api/admin/jobs/inventory")
            .set("X-Admin-API-Key", "test-only-key")
        ).status,
      ).toBe(200);
    const res = await request(app)
      .get("/api/admin/jobs/inventory")
      .set("X-Admin-API-Key", "test-only-key");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });
  it("validates explicit admin bucket refresh and rejects force", async () => {
    const { app, operation } = setup();
    const send = (body: object) =>
      request(app)
        .post("/api/admin/jobs/refresh")
        .set("X-Admin-API-Key", "test-only-key")
        .send(body);
    expect(
      (
        await send({
          country: "DE",
          category: "warehouse-logistics",
          force: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await send({ country: "DE", category: "warehouse-logistics" })).status,
    ).toBe(200);
    expect(operation).toHaveBeenCalledWith("admin", {
      country: "DE",
      category: "warehouse-logistics",
    });
  });
  it("public filters never invoke inventory/upstream even with force parameters", async () => {
    const { app, operation, repo } = setup();
    const res = await request(app).get(
      "/api/jobs?country=DE&category=warehouse-logistics&city=Berlin&state=Berlin&remote=true&employment_type=full-time&experience_level=entry&page=2&limit=5&refresh=true&force=true",
    );
    expect(res.status).toBe(200);
    expect(operation).not.toHaveBeenCalled();
    expect(repo.findJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "DE",
        city: "Berlin",
        state: "Berlin",
        remote: true,
        page: 2,
        limit: 5,
        employmentTypeValues: ["Full-time"],
      }),
    );
    expect(res.headers["cache-control"]).toContain("s-maxage=900");
  });
  it.each([
    ["?country=AU", 1800],
    ["?q=engineer", 300],
  ])("sets cache TTL for %s", async (query, ttl) => {
    const { app } = setup();
    const r = await request(app).get("/api/jobs" + query);
    expect(r.headers["cache-control"]).toContain(`s-maxage=${ttl}`);
  });
});
describe("separate credential and operational endpoints", () => {
  it("a public developer credential cannot authorize admin", async () => {
    const operation = vi.fn();
    const app = createApp({
      adminKey: "private-test",
      inventoryOperation: operation,
    });
    for (const path of ["inventory", "budget", "audit"]) {
      const response = await request(app)
        .get("/api/admin/jobs/" + path)
        .set("X-API-Key", "public-developer")
        .set("Authorization", "Bearer public-developer");
      expect(response.status).toBe(401);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(operation).not.toHaveBeenCalled();
  });
  it("serves budget/audit only with the internal credential", async () => {
    const operation = vi.fn(async () => ({ items: [] }));
    const app = createApp({
      adminKey: "private-test",
      inventoryOperation: operation,
    });
    expect(
      (
        await request(app)
          .get("/api/admin/jobs/budget")
          .set("X-Admin-API-Key", "private-test")
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/admin/jobs/audit?page=2&limit=5")
          .set("X-Admin-API-Key", "private-test")
      ).status,
    ).toBe(200);
    expect(operation).toHaveBeenCalledWith("audit", { page: 2, limit: 5 });
    expect(
      (
        await request(app)
          .get("/api/admin/jobs/audit?limit=101")
          .set("X-Admin-API-Key", "private-test")
      ).status,
    ).toBe(400);
  });
});
