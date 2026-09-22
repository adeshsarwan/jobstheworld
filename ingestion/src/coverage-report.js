import { pool, ensureDatabaseSchema } from '../db.js';

async function printRows(title, rows, formatter) {
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

    const [[total]] = await connection.query(`SELECT COUNT(*) AS count FROM jobs WHERE active = 1`);
    const [byCountry] = await connection.query(`SELECT COALESCE(country, 'NULL') AS country, COUNT(*) AS count FROM jobs WHERE active = 1 GROUP BY COALESCE(country, 'NULL') ORDER BY count DESC, country ASC`);
    const [byCategory] = await connection.query(`SELECT COALESCE(category, 'NULL') AS category, COUNT(*) AS count FROM jobs WHERE active = 1 GROUP BY COALESCE(category, 'NULL') ORDER BY count DESC, category ASC`);
    const [byCountryCategory] = await connection.query(`SELECT COALESCE(country, 'NULL') AS country, COALESCE(category, 'NULL') AS category, COUNT(*) AS count FROM jobs WHERE active = 1 GROUP BY COALESCE(country, 'NULL'), COALESCE(category, 'NULL') ORDER BY country ASC, count DESC, category ASC`);
    const [[last24]] = await connection.query(`SELECT COUNT(*) AS count FROM jobs WHERE active = 1 AND first_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
    const [[last7]] = await connection.query(`SELECT COUNT(*) AS count FROM jobs WHERE active = 1 AND first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
    const [[nullCountry]] = await connection.query(`SELECT COUNT(*) AS count FROM jobs WHERE active = 1 AND country IS NULL`);
    const [[nullCategory]] = await connection.query(`SELECT COUNT(*) AS count FROM jobs WHERE active = 1 AND category IS NULL`);

    console.log('Job coverage report');
    console.log(`Total active jobs: ${total.count}`);
    await printRows('Active jobs by country:', byCountry, (row) => `${row.country}: ${row.count}`);
    await printRows('Active jobs by category:', byCategory, (row) => `${row.category}: ${row.count}`);
    await printRows('Active jobs by country and category:', byCountryCategory, (row) => `${row.country} / ${row.category}: ${row.count}`);
    console.log(`Jobs added in the last 24 hours: ${last24.count}`);
    console.log(`Jobs added in the last 7 days: ${last7.count}`);
    console.log(`Jobs with NULL country: ${nullCountry.count}`);
    console.log(`Jobs with NULL category: ${nullCategory.count}`);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
