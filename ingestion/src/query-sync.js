import { pool, ensureDatabaseSchema } from '../db.js';
import { pathToFileURL } from 'node:url';
import { countrySpecificQueryKeys, generateQueries, priorityForCountry } from './query-generator.js';

async function disableStaleCountrySpecificQueries(connection) {
  let disabled = 0;

  for (const [countryCode, validKeys] of countrySpecificQueryKeys()) {
    const [rows] = await connection.execute(
      `SELECT id, category_slug, search_term
         FROM job_ingestion_queries
        WHERE country_code = ?
          AND enabled = 1`,
      [countryCode]
    );

    const staleIds = rows
      .filter((row) => !validKeys.has(`${row.category_slug}\u0000${row.search_term}`))
      .map((row) => row.id);

    for (let index = 0; index < staleIds.length; index += 100) {
      const chunk = staleIds.slice(index, index + 100);
      const placeholders = chunk.map(() => '?').join(', ');
      const [result] = await connection.execute(
        `UPDATE job_ingestion_queries
            SET enabled = 0,
                updated_at = CURRENT_TIMESTAMP
          WHERE id IN (${placeholders})`,
        chunk
      );
      disabled += Number(result.affectedRows || 0);
    }
  }

  return disabled;
}

export async function syncQueries(connection) {
  const queries = generateQueries();
  let processed = 0;

  for (const query of queries) {
    await connection.execute(
      `INSERT INTO job_ingestion_queries (
         country_code, category_slug, search_term, query_text, enabled, priority
       ) VALUES (?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         query_text = VALUES(query_text),
         priority = VALUES(priority),
         updated_at = CURRENT_TIMESTAMP`,
      [
        query.countryCode,
        query.categorySlug,
        query.searchTerm,
        query.query,
        priorityForCountry(query.countryCode)
      ]
    );
    processed += 1;
  }

  const disabledRows = await disableStaleCountrySpecificQueries(connection);

  const [countRows] = await connection.execute(
    `SELECT COUNT(*) AS total, SUM(enabled = 1) AS enabled FROM job_ingestion_queries`
  );

  return {
    configured: queries.length,
    processed,
    disabledRows,
    totalRows: Number(countRows[0]?.total || 0),
    enabledRows: Number(countRows[0]?.enabled || 0)
  };
}

async function main() {
  let connection;

  try {
    connection = await pool.getConnection();
    await ensureDatabaseSchema(connection);
    const result = await syncQueries(connection);
    console.log(`Query sync complete. configured=${result.configured} processed=${result.processed} disabled_rows=${result.disabledRows} total_rows=${result.totalRows} enabled_rows=${result.enabledRows}`);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
