import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const fallbackEnvPath = '/home/adesh/test/.env';

function loadEnvironment() {
  const candidates = [
    process.env.ENV_FILE,
    path.join(rootDir, '.env'),
    fallbackEnvPath
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
      return candidate;
    }
  }

  dotenv.config({ override: false });
  return null;
}

export function createDatabaseConfig() {
  loadEnvironment();

  return {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'job_board',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
  };
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, definition) {
  if (await columnExists(connection, tableName, columnName)) return false;
  await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  return true;
}

async function addIndexIfMissing(connection, tableName, indexName, definition) {
  if (await indexExists(connection, tableName, indexName)) return false;
  await connection.query(`ALTER TABLE ${tableName} ADD ${definition}`);
  return true;
}

function slugify(value) {
  const slug = String(value || 'job')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 190);

  return slug || 'job';
}

function parsePayload(rawPayload) {
  if (!rawPayload) return {};
  if (typeof rawPayload === 'object') return rawPayload;

  try {
    return JSON.parse(rawPayload);
  } catch {
    return {};
  }
}

function cleanText(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).replace(/\u0000/g, '').trim();
  return text || fallback;
}

function normalizeEmploymentType(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = cleanText(raw);
  if (!text) return null;

  const normalized = text.toLowerCase().replace(/[_-]+/g, ' ');
  if (normalized.includes('full')) return 'Full-time';
  if (normalized.includes('part')) return 'Part-time';
  if (normalized.includes('contract')) return 'Contract';
  if (normalized.includes('intern')) return 'Internship';
  if (normalized.includes('temporary') || normalized.includes('temp')) return 'Temporary';
  return text;
}

function inferRemote(raw, title, location) {
  if (raw?.job_is_remote === true || raw?.job_is_remote === 1) return 1;
  const haystack = `${title || ''} ${location || ''}`.toLowerCase();
  return /\b(remote|work from home|wfh)\b/.test(haystack) ? 1 : 0;
}

function inferDate(raw) {
  const direct = cleanText(raw?.job_posted_at_datetime_utc);
  if (direct && !Number.isNaN(Date.parse(direct))) {
    return new Date(direct);
  }

  const timestamp = Number(raw?.job_posted_at_timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000);
  }

  return null;
}

function parseLocation(location, raw) {
  const rawCity = cleanText(raw?.job_city);
  const rawState = cleanText(raw?.job_state);
  const rawCountry = cleanText(raw?.job_country);
  if (rawCity || rawState || rawCountry) {
    return {
      city: rawCity,
      state: rawState,
      country: rawCountry || 'US'
    };
  }

  const parts = String(location || '')
    .split(',')
    .map((part) => cleanText(part))
    .filter(Boolean);

  return {
    city: parts[0] || null,
    state: parts[1] || null,
    country: parts[2] || (parts.length ? 'US' : null)
  };
}

export async function ensurePhaseOneSchema(connection, options = {}) {
  const verbose = options.verbose ?? false;
  const changes = [];

  await connection.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      logo_url MEDIUMTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_companies_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      api_source VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      source_id MEDIUMTEXT NOT NULL,
      source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      slug VARCHAR(255) NULL,
      title TEXT NOT NULL,
      company_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(100) NULL,
      location TEXT NULL,
      city VARCHAR(120) NULL,
      state VARCHAR(120) NULL,
      country VARCHAR(120) NULL,
      employment_type VARCHAR(80) NULL,
      is_remote TINYINT(1) NOT NULL DEFAULT 0,
      description MEDIUMTEXT NULL,
      redirect_url MEDIUMTEXT NULL,
      salary_min DECIMAL(20,4) NULL,
      salary_max DECIMAL(20,4) NULL,
      salary_period VARCHAR(30) NULL,
      posted_at DATETIME NULL,
      raw_payload JSON NULL,
      first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active TINYINT(1) NOT NULL DEFAULT 1,
      removed_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_jobs_source_hash (api_source, source_hash),
      KEY idx_jobs_company_id (company_id),
      KEY idx_jobs_category (category),
      KEY idx_jobs_last_seen_at (last_seen_at),
      KEY idx_jobs_active_last_seen (active, last_seen_at),
      CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const columnDefinitions = [
    ['slug', 'slug VARCHAR(255) NULL AFTER source_hash'],
    ['city', 'city VARCHAR(120) NULL AFTER location'],
    ['state', 'state VARCHAR(120) NULL AFTER city'],
    ['country', 'country VARCHAR(120) NULL AFTER state'],
    ['employment_type', 'employment_type VARCHAR(80) NULL AFTER country'],
    ['is_remote', 'is_remote TINYINT(1) NOT NULL DEFAULT 0 AFTER employment_type'],
    ['salary_period', 'salary_period VARCHAR(30) NULL AFTER salary_max'],
    ['posted_at', 'posted_at DATETIME NULL AFTER salary_period'],
    ['active', 'active TINYINT(1) NOT NULL DEFAULT 1 AFTER last_seen_at'],
    ['removed_at', 'removed_at DATETIME NULL AFTER active']
  ];

  for (const [columnName, definition] of columnDefinitions) {
    if (await addColumnIfMissing(connection, 'jobs', columnName, definition)) {
      changes.push(`jobs.${columnName}`);
    }
  }

  await connection.query(`UPDATE jobs SET active = 1 WHERE active IS NULL`);

  const [rows] = await connection.query(`
    SELECT id, title, source_hash, slug, location, city, state, country,
           employment_type, is_remote, salary_period, posted_at, raw_payload
      FROM jobs
     WHERE slug IS NULL OR slug = ''
        OR city IS NULL OR state IS NULL OR country IS NULL
        OR employment_type IS NULL OR salary_period IS NULL OR posted_at IS NULL
        OR is_remote = 0
  `);

  for (const row of rows) {
    const raw = parsePayload(row.raw_payload);
    const location = parseLocation(row.location, raw);
    const title = cleanText(row.title, 'job');
    const sourceSuffix = String(row.source_hash || row.id).slice(0, 8).toLowerCase();
    const slug = cleanText(row.slug) || `${slugify(title)}-${sourceSuffix}`;
    const employmentType = cleanText(row.employment_type) || normalizeEmploymentType(raw?.job_employment_type || raw?.job_employment_types);
    const salaryPeriod = cleanText(row.salary_period) || cleanText(raw?.job_salary_period);
    const postedAt = row.posted_at || inferDate(raw);
    const remote = row.is_remote ? 1 : inferRemote(raw, title, row.location);

    await connection.execute(
      `UPDATE jobs
          SET slug = ?,
              city = COALESCE(NULLIF(city, ''), ?),
              state = COALESCE(NULLIF(state, ''), ?),
              country = COALESCE(NULLIF(country, ''), ?),
              employment_type = COALESCE(NULLIF(employment_type, ''), ?),
              is_remote = IF(is_remote = 1, 1, ?),
              salary_period = COALESCE(NULLIF(salary_period, ''), ?),
              posted_at = COALESCE(posted_at, ?)
        WHERE id = ?`,
      [
        slug,
        location.city,
        location.state,
        location.country,
        employmentType,
        remote,
        salaryPeriod,
        postedAt,
        row.id
      ]
    );
  }

  await addIndexIfMissing(connection, 'jobs', 'uq_jobs_slug', 'UNIQUE KEY uq_jobs_slug (slug)');
  await addIndexIfMissing(connection, 'jobs', 'uq_jobs_source_hash_only', 'UNIQUE KEY uq_jobs_source_hash_only (source_hash)');
  await addIndexIfMissing(connection, 'jobs', 'idx_jobs_active', 'KEY idx_jobs_active (active)');
  await addIndexIfMissing(connection, 'jobs', 'idx_jobs_country', 'KEY idx_jobs_country (country)');
  await addIndexIfMissing(connection, 'jobs', 'idx_jobs_posted_at', 'KEY idx_jobs_posted_at (posted_at)');
  await addIndexIfMissing(connection, 'jobs', 'idx_jobs_active_last_seen', 'KEY idx_jobs_active_last_seen (active, last_seen_at)');
  await addIndexIfMissing(connection, 'jobs', 'idx_jobs_filters', 'KEY idx_jobs_filters (active, category, city, state, employment_type, is_remote)');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS job_ingestion_queries (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      country_code VARCHAR(2) NOT NULL,
      category_slug VARCHAR(100) NOT NULL,
      search_term VARCHAR(255) NOT NULL,
      query_text VARCHAR(500) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      priority INT NOT NULL DEFAULT 100,
      last_run_at DATETIME NULL,
      next_run_at DATETIME NULL,
      run_count INT UNSIGNED NOT NULL DEFAULT 0,
      success_count INT UNSIGNED NOT NULL DEFAULT 0,
      failure_count INT UNSIGNED NOT NULL DEFAULT 0,
      total_jobs_returned INT UNSIGNED NOT NULL DEFAULT 0,
      total_jobs_saved INT UNSIGNED NOT NULL DEFAULT 0,
      total_duplicates INT UNSIGNED NOT NULL DEFAULT 0,
      last_jobs_returned INT UNSIGNED NOT NULL DEFAULT 0,
      last_jobs_saved INT UNSIGNED NOT NULL DEFAULT 0,
      last_duplicates INT UNSIGNED NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      average_duration_ms INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_job_ingestion_queries_definition (country_code, category_slug, search_term),
      KEY idx_job_ingestion_queries_enabled (enabled),
      KEY idx_job_ingestion_queries_priority (priority),
      KEY idx_job_ingestion_queries_next_run_at (next_run_at),
      KEY idx_job_ingestion_queries_last_run_at (last_run_at),
      KEY idx_job_ingestion_queries_country_code (country_code),
      KEY idx_job_ingestion_queries_category_slug (category_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_enabled', 'KEY idx_job_ingestion_queries_enabled (enabled)');
  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_priority', 'KEY idx_job_ingestion_queries_priority (priority)');
  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_next_run_at', 'KEY idx_job_ingestion_queries_next_run_at (next_run_at)');
  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_last_run_at', 'KEY idx_job_ingestion_queries_last_run_at (last_run_at)');
  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_country_code', 'KEY idx_job_ingestion_queries_country_code (country_code)');
  await addIndexIfMissing(connection, 'job_ingestion_queries', 'idx_job_ingestion_queries_category_slug', 'KEY idx_job_ingestion_queries_category_slug (category_slug)');

  if (verbose) {
    if (changes.length) {
      console.log(`Added columns: ${changes.join(', ')}`);
    } else {
      console.log('No new columns were required.');
    }
    console.log(`Backfilled ${rows.length} existing job row(s) where useful.`);
  }

  return { addedColumns: changes, backfilledRows: rows.length };
}

export async function runMigrations() {
  const pool = mysql.createPool(createDatabaseConfig());
  const connection = await pool.getConnection();

  try {
    const result = await ensurePhaseOneSchema(connection, { verbose: true });
    return result;
  } finally {
    connection.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
