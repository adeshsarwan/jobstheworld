import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../middleware/errorHandler.js";
export type InventoryOperation = (
  mode: string,
  selection?: {
    country?: string;
    category?: string;
    page?: number;
    limit?: number;
  },
) => Promise<unknown>;
export function adminRoutes(
  operation: InventoryOperation,
  key = process.env.JOBS_ADMIN_API_KEY || "",
  now = Date.now,
) {
  const router = Router();
  let windowStart = 0;
  let requests = 0;
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use((req, res, next) => {
    if (!key) throw new HttpError(503, "Admin API is not configured");
    const provided = req.get("X-Admin-API-Key") || "";
    const hash = (s: string) => createHash("sha256").update(s).digest();
    if (!provided || !timingSafeEqual(hash(provided), hash(key)))
      throw new HttpError(401, "Invalid admin API key");
    if (now() - windowStart >= 60000) {
      windowStart = now();
      requests = 0;
    }
    if (++requests > 10) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((60000 - (now() - windowStart)) / 1000))),
      );
      throw new HttpError(429, "Admin rate limit exceeded");
    }
    next();
  });
  router.get("/inventory", async (_req, res) => {
    res.json({ success: true, data: await operation("status") });
  });
  router.get("/budget", async (_req, res) => {
    res.json({ success: true, data: await operation("budget") });
  });
  router.get("/audit", async (req, res) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "Invalid audit pagination");
    res.json({ success: true, data: await operation("audit", parsed.data) });
  });
  router.post("/refresh", async (req, res) => {
    const parsed = z
      .object({
        country: z.enum(["US", "GB", "DE", "AU"]),
        category: z.string().min(1).max(100),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid refresh request");
    // Validate the category against the same public canonical category set.
    const { workCategories } = await import("../services/categoryConfig.js");
    if (!workCategories.some((c) => c.value === parsed.data.category))
      throw new HttpError(400, "Invalid category");
    res.json({ success: true, data: await operation("admin", parsed.data) });
  });
  return router;
}
