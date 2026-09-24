import mysql from "mysql2/promise";
import { createDatabaseConfig } from "../../database/run-migrations.js";
import { config, decision } from "./config.js";
import { MysqlInventoryStore } from "./store.js";
import { runInventory } from "./engine.js";
import { saveJob } from "../src/persist-job.js";
export async function inventoryOperation(mode = "status", selection) {
  const { waitForConnections, connectionLimit, queueLimit, ...settings } = createDatabaseConfig();
  const c = config();
  const db = await mysql.createConnection({ ...settings, timezone: "Z" });
  try {
    await db.query("SET time_zone='+00:00'");
    const store = new MysqlInventoryStore(db, c);
    if (mode === "budget") {
      const state = await store.state();
      return {
        monthlyLimit: c.monthly,
        dailyLimit: c.daily,
        adminReserve: c.reserve,
        monthUsed: state.month,
        dayUsed: state.day,
        circuitBlocked: state.blocked,
        blockedAt: state.blocked_at,
        safeHeaders: state.safe_headers,
      };
    }
    if (mode === "audit") {
      const limit = Math.min(100, Math.max(1, Number(selection?.limit) || 20));
      const page = Math.min(100000, Math.max(1, Number(selection?.page) || 1));
      const [rows] = await db.query(
        `SELECT * FROM job_refresh_audit ORDER BY id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      );
      return { items: rows, page, limit };
    }
    if (mode === "status") {
      if (!(await store.acquire())) return { status: "busy" };
      try {
        const buckets = await store.evaluate();
        const state = await store.state();
        const readiness = (b, trigger) => {
          const reason = decision(b, c, state, trigger);
          return reason === "eligible" && !process.env.RAPIDAPI_KEY?.trim()
            ? "missing_key"
            : reason;
        };
        return {
          status: "ok",
          enabled: c.enabled,
          budget: {
            monthlyLimit: c.monthly,
            dailyLimit: c.daily,
            adminReserve: c.reserve,
            monthUsed: state.month,
            dayUsed: state.day,
          },
          circuitBlocked: state.blocked,
          buckets: buckets.map((b) => ({
            ...b,
            reason: readiness(b, "daily"),
            adminReason: readiness(b, "admin"),
          })),
        };
      } finally {
        await store.release();
      }
    }
    return await runInventory({
      store,
      c,
      key: process.env.RAPIDAPI_KEY,
      trigger: mode,
      selection,
      save: (raw, target) => saveJob(db, raw, target),
    });
  } finally {
    await db.end();
  }
}
