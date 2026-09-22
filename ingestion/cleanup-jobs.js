import { pool, ensureDatabaseSchema } from './db.js';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const retentionDays = positiveInteger(process.env.JOB_RETENTION_DAYS, 30);
  const dryRun = process.argv.includes('--dry-run');
  let connection;

  console.log(`Starting stale-job cleanup (${retentionDays}-day retention${dryRun ? ', dry run' : ''}).`);

  try {
    connection = await pool.getConnection();
    await ensureDatabaseSchema(connection);

    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS stale_count
         FROM jobs
        WHERE active = 1
          AND last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    );
    const staleCount = Number(countRows[0]?.stale_count || 0);

    if (dryRun) {
      console.log(`${staleCount} stale jobs would be marked inactive.`);
      return;
    }

    const [updateRows] = await connection.execute(
      `UPDATE jobs
          SET active = 0,
              removed_at = COALESCE(removed_at, NOW())
        WHERE active = 1
          AND last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    );

    console.log(`Marked ${updateRows.affectedRows} stale jobs inactive.`);
  } catch (error) {
    console.error('Cleanup failed:', error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main();
