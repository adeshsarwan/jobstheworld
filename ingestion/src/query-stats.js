import { pool, ensureDatabaseSchema } from '../db.js';

function printRows(title, rows, formatter) {
  console.log(title);
  if (!rows.length) {
    console.log('  none');
    return;
  }
  for (const row of rows) console.log(`  ${formatter(row)}`);
}

async function main() {
  let connection;

  try {
    connection = await pool.getConnection();
    await ensureDatabaseSchema(connection);

    const [[summary]] = await connection.query(`
      SELECT
        COUNT(*) AS total_configured_queries,
        SUM(enabled = 1) AS enabled_queries,
        SUM(run_count = 0) AS queries_never_run,
        SUM(enabled = 1 AND (next_run_at IS NULL OR next_run_at <= NOW())) AS queries_currently_due,
        SUM(success_count) AS successful_query_runs,
        SUM(failure_count) AS failed_query_runs,
        ROUND(SUM(total_jobs_saved) / NULLIF(SUM(run_count), 0), 2) AS average_jobs_saved_per_query_run,
        ROUND((SUM(success_count) / NULLIF(SUM(success_count) + SUM(failure_count), 0)) * 100, 2) AS api_query_success_rate
      FROM job_ingestion_queries
    `);
    const [topSaved] = await connection.query(`
      SELECT country_code, category_slug, search_term, total_jobs_saved, run_count
        FROM job_ingestion_queries
       ORDER BY total_jobs_saved DESC, run_count DESC, id ASC
       LIMIT 20
    `);
    const [bottomSaved] = await connection.query(`
      SELECT country_code, category_slug, search_term, total_jobs_saved, run_count
        FROM job_ingestion_queries
       WHERE run_count > 0
       ORDER BY total_jobs_saved ASC, run_count DESC, id ASC
       LIMIT 20
    `);
    const [mostFailures] = await connection.query(`
      SELECT country_code, category_slug, search_term, failure_count, last_error
        FROM job_ingestion_queries
       WHERE failure_count > 0
       ORDER BY failure_count DESC, id ASC
       LIMIT 20
    `);

    console.log('Query performance report');
    console.log(`total configured queries: ${summary.total_configured_queries || 0}`);
    console.log(`enabled queries: ${summary.enabled_queries || 0}`);
    console.log(`queries never run: ${summary.queries_never_run || 0}`);
    console.log(`queries currently due: ${summary.queries_currently_due || 0}`);
    console.log(`successful query runs: ${summary.successful_query_runs || 0}`);
    console.log(`failed query runs: ${summary.failed_query_runs || 0}`);
    console.log(`average jobs saved per query run: ${summary.average_jobs_saved_per_query_run || 0}`);
    console.log(`API query success rate: ${summary.api_query_success_rate || 0}%`);
    printRows('top 20 queries by total_jobs_saved:', topSaved, (row) => `${row.country_code} ${row.category_slug} "${row.search_term}": saved=${row.total_jobs_saved} runs=${row.run_count}`);
    printRows('bottom 20 queries that have run at least once:', bottomSaved, (row) => `${row.country_code} ${row.category_slug} "${row.search_term}": saved=${row.total_jobs_saved} runs=${row.run_count}`);
    printRows('queries with most failures:', mostFailures, (row) => `${row.country_code} ${row.category_slug} "${row.search_term}": failures=${row.failure_count}${row.last_error ? ` last_error=${row.last_error}` : ''}`);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
