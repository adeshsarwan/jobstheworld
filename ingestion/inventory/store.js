import categories from "../config/categories.js";
import { markets, decision } from "./config.js";
export class MysqlInventoryStore {
  constructor(db, c) {
    this.db = db;
    this.c = c;
  }
  async acquire() {
    const [rows] = await this.db.query(
      "SELECT GET_LOCK('jobstheworld:jsearch:inventory', 0) AS acquired",
    );
    return rows[0].acquired === 1;
  }
  async release() {
    await this.db.query(
      "SELECT RELEASE_LOCK('jobstheworld:jsearch:inventory')",
    );
  }
  async evaluate() {
    const c = this.c;
    for (const country of Object.keys(markets))
      for (const category of categories) {
        await this.db.execute(
          `INSERT INTO job_inventory_buckets
        (country_code,category_slug,usable_count,fresh_3d_count,healthy,last_evaluated_at)
        SELECT ?,?,COUNT(*),COALESCE(SUM(posted_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) AND posted_at <= UTC_TIMESTAMP()),0),
        COUNT(*) >= ? AND COALESCE(SUM(posted_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) AND posted_at <= UTC_TIMESTAMP()),0) >= ?,UTC_TIMESTAMP(3)
        FROM jobs WHERE active=1 AND country=? AND category=?
        ON DUPLICATE KEY UPDATE usable_count=VALUES(usable_count),fresh_3d_count=VALUES(fresh_3d_count),healthy=VALUES(healthy),last_evaluated_at=VALUES(last_evaluated_at)`,
          [
            country,
            category.slug,
            c.days,
            c.usable,
            c.days,
            c.fresh,
            country,
            category.slug,
          ],
        );
      }
    return this.buckets();
  }
  async buckets() {
    const [rows] = await this.db.query("SELECT * FROM job_inventory_buckets");
    return rows.map((b) => ({
      ...b,
      usable_count: Number(b.usable_count),
      fresh_3d_count: Number(b.fresh_3d_count),
      healthy: Boolean(b.healthy),
    }));
  }
  async state() {
    const [rows] = await this.db
      .query(`SELECT s.blocked,s.next_request_at,s.blocked_at,s.safe_headers,
      COALESCE((SELECT request_count FROM jsearch_request_budgets WHERE period_key=DATE_FORMAT(UTC_TIMESTAMP(),'month:%Y-%m')),0) AS month,
      COALESCE((SELECT request_count FROM jsearch_request_budgets WHERE period_key=DATE_FORMAT(UTC_TIMESTAMP(),'day:%Y-%m-%d')),0) AS day
      FROM jsearch_refresh_state s WHERE id=1`);
    if (!rows.length) throw new Error("Inventory migration required");
    return {
      ...rows[0],
      blocked: Boolean(rows[0].blocked),
      month: Number(rows[0].month),
      day: Number(rows[0].day),
    };
  }
  async audit(bucket, trigger, reason, query) {
    const [r] = await this.db.execute(
      `INSERT INTO job_refresh_audit
      (trigger_type,country_code,category_slug,query_text,usable_count,fresh_3d_count,decision,status,started_at,completed_at,cooldown_until)
      VALUES (?,?,?,?,?,?,?,'skipped',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?)`,
      [
        trigger,
        bucket.country_code,
        bucket.category_slug,
        query,
        bucket.usable_count,
        bucket.fresh_3d_count,
        reason,
        bucket.cooldown_until,
      ],
    );
    await this.db.execute(
      "UPDATE job_inventory_buckets SET last_refresh_reason=? WHERE country_code=? AND category_slug=?",
      [reason, bucket.country_code, bucket.category_slug],
    );
    return r.insertId;
  }
  async reserve(bucket, trigger, query) {
    await this.db.beginTransaction();
    try {
      const [rows] = await this.db.execute(
        "SELECT * FROM job_inventory_buckets WHERE country_code=? AND category_slug=? FOR UPDATE",
        [bucket.country_code, bucket.category_slug],
      );
      const state = await this.state();
      const reason = decision(rows[0], this.c, state, trigger);
      if (reason !== "eligible") {
        await this.db.rollback();
        return { reason };
      }
      const id = await this.audit(rows[0], trigger, "eligible", query);
      await this.db
        .query(`INSERT INTO jsearch_request_budgets(period_key,request_count)
        VALUES (DATE_FORMAT(UTC_TIMESTAMP(),'month:%Y-%m'),1),(DATE_FORMAT(UTC_TIMESTAMP(),'day:%Y-%m-%d'),1)
        ON DUPLICATE KEY UPDATE request_count=request_count+1`);
      await this.db.execute(
        `UPDATE job_inventory_buckets SET last_refresh_attempt_at=UTC_TIMESTAMP(3),
        cooldown_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? HOUR),lock_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),last_refresh_reason='attempt',last_error=NULL
        WHERE country_code=? AND category_slug=?`,
        [this.c.cooldown, bucket.country_code, bucket.category_slug],
      );
      await this.db.execute(
        `UPDATE job_refresh_audit SET upstream_request_count=1,status='reserved',completed_at=NULL,
        cooldown_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? HOUR) WHERE id=?`,
        [this.c.cooldown, id],
      );
      // Reservation is charged before network I/O, even if the process crashes.
      await this.db.execute(
        "UPDATE jsearch_refresh_state SET next_request_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND) WHERE id=1",
        [(60000 + this.c.throttle) * 1000],
      );
      await this.db.commit();
      return { id };
    } catch (e) {
      await this.db.rollback();
      throw e;
    }
  }
  async block(headers) {
    await this.db.execute(
      "UPDATE jsearch_refresh_state SET blocked=TRUE,blocked_at=UTC_TIMESTAMP(3),safe_headers=? WHERE id=1",
      [JSON.stringify(headers)],
    );
  }
  async finish(id, b, result) {
    await this.db.beginTransaction();
    try {
      await this.db.execute(
        `UPDATE job_refresh_audit SET http_status=?,safe_headers=?,jobs_returned=?,inserted_count=?,updated_count=?,failed_count=?,status=?,error_text=?,completed_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [
          result.httpStatus,
          JSON.stringify(result.headers),
          result.returned,
          result.inserted,
          result.updated,
          result.failed,
          result.status,
          result.error,
          id,
        ],
      );
      await this.db.execute(
        `UPDATE job_inventory_buckets SET lock_until=NULL,last_refresh_reason=?,last_error=?,
        last_refresh_success_at=IF(?='success',UTC_TIMESTAMP(3),last_refresh_success_at) WHERE country_code=? AND category_slug=?`,
        [
          result.status,
          result.error,
          result.status,
          b.country_code,
          b.category_slug,
        ],
      );
      await this.db.execute(
        "UPDATE jsearch_refresh_state SET next_request_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? MICROSECOND) WHERE id=1",
        [this.c.throttle * 1000],
      );
      await this.db.commit();
    } catch (e) {
      await this.db.rollback();
      throw e;
    }
  }
}
