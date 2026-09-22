import axios from 'axios';
import { pathToFileURL } from 'node:url';
import { pool, ensureDatabaseSchema } from './db.js';
import countries from './config/countries.js';
import categories from './config/categories.js';
import { saveJob } from './src/persist-job.js';
import { normalizeBatchSize, normalizeConcurrency, nextRunHoursForResult } from './src/query-settings.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 60000);
const API_MAX_ATTEMPTS = Math.max(1, Number(process.env.API_MAX_ATTEMPTS || 3));
const API_429_RETRY_MS = Math.max(0, Number(process.env.API_429_RETRY_MS || process.env.RAPIDAPI_429_RETRY_MS || 60000));
const QUERY_THROTTLE_MS = Math.max(0, Number(process.env.QUERY_THROTTLE_MS || 4000));
const API_DATE_POSTED = (process.env.JOB_DATE_POSTED || process.env.RAPIDAPI_DATE_POSTED || 'all').trim() || 'all';

const countryByCode = new Map(countries.map((country) => [country.code, country]));
const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

function retryable(error) {
  const status = error?.response?.status;
  return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || status === 429 || status >= 500;
}

function parseRetryAfterMs(value) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());

  return null;
}

function retryDelayMs(error, attempt) {
  const status = error?.response?.status;
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(error?.response?.headers?.['retry-after']);
    return retryAfterMs ?? API_429_RETRY_MS * attempt;
  }

  return 5000 * (2 ** (attempt - 1));
}

async function fetchWithRetry(options, label) {
  let lastError;

  for (let attempt = 1; attempt <= API_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.request(options);
      if (response.status === 429 || response.status >= 500) {
        const error = new Error(`HTTP ${response.status}`);
        error.response = response;
        throw error;
      }
      return { response, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === API_MAX_ATTEMPTS) break;

      const delayMs = retryDelayMs(error, attempt);
      console.warn(`${label}: attempt ${attempt}/${API_MAX_ATTEMPTS} failed (${error.message}). Retrying in ${delayMs / 1000}s.`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function extractJobs(payload) {
  if (typeof payload === 'string') {
    const body = payload.trim();
    if (body.startsWith('<!DOCTYPE') || body.startsWith('<html')) {
      throw new Error('API returned HTML instead of JSON.');
    }
    return extractJobs(JSON.parse(body));
  }

  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function normalizeCountryFilter(value = process.env.JOB_FETCH_COUNTRIES) {
  if (!value) return [];

  return [...new Set(
    String(value)
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
  )];
}

export async function selectDueQueries(connection, batchSize = normalizeBatchSize(), filters = {}) {
  const limit = Math.min(Math.max(1, Number(batchSize) || 40), 100);
  const countryFilter = normalizeCountryFilter(filters.countries);
  const params = [];
  const where = [
    'enabled = 1',
    '(next_run_at IS NULL OR next_run_at <= NOW())'
  ];

  if (countryFilter.length) {
    where.push(`country_code IN (${countryFilter.map(() => '?').join(', ')})`);
    params.push(...countryFilter);
  }

  const [rows] = await connection.execute(
    `SELECT id, country_code, category_slug, search_term, query_text, priority
       FROM job_ingestion_queries
      WHERE ${where.join('\n        AND ')}
      ORDER BY priority ASC,
               CASE WHEN last_run_at IS NULL THEN 0 ELSE 1 END ASC,
               last_run_at ASC,
               id ASC
      LIMIT ${limit}`,
    params
  );
  return rows;
}

function emptyCountrySummary() {
  return { queries: 0, returned: 0, inserted: 0, updated: 0 };
}

function mergeSummary(total, result) {
  total.selectedQueries += 1;
  if (result.success) total.successfulQueries += 1;
  else total.failedQueries += 1;
  total.jobsReturned += result.jobsReturned;
  total.newJobsInserted += result.jobsInserted;
  total.existingJobsUpdated += result.duplicates;
  total.jobsFailed += result.jobsFailed;

  const country = result.countryCode || 'NULL';
  if (!total.byCountry[country]) total.byCountry[country] = emptyCountrySummary();
  total.byCountry[country].queries += 1;
  total.byCountry[country].returned += result.jobsReturned;
  total.byCountry[country].inserted += result.jobsInserted;
  total.byCountry[country].updated += result.duplicates;
}

async function updateQueryStats(connection, query, result) {
  const hours = nextRunHoursForResult({ failed: !result.success, jobsSaved: result.jobsInserted });
  const errorText = result.lastError ? String(result.lastError).slice(0, 1000) : null;

  await connection.execute(
    `UPDATE job_ingestion_queries
        SET last_run_at = NOW(),
            next_run_at = DATE_ADD(NOW(), INTERVAL ${hours} HOUR),
            run_count = run_count + 1,
            success_count = success_count + ?,
            failure_count = failure_count + ?,
            total_jobs_returned = total_jobs_returned + ?,
            total_jobs_saved = total_jobs_saved + ?,
            total_duplicates = total_duplicates + ?,
            last_jobs_returned = ?,
            last_jobs_saved = ?,
            last_duplicates = ?,
            last_error = ?,
            average_duration_ms = IF(
              average_duration_ms IS NULL,
              ?,
              ROUND(((average_duration_ms * run_count) + ?) / (run_count + 1))
            )
      WHERE id = ?`,
    [
      result.success ? 1 : 0,
      result.success ? 0 : 1,
      result.jobsReturned,
      result.jobsInserted,
      result.duplicates,
      result.jobsReturned,
      result.jobsInserted,
      result.duplicates,
      errorText,
      result.durationMs,
      result.durationMs,
      query.id
    ]
  );
}

async function processQuery(query, rapidApiKey) {
  const started = Date.now();
  const category = categoryBySlug.get(query.category_slug);
  const country = countryByCode.get(query.country_code);
  let connection;
  const result = {
    success: false,
    countryCode: query.country_code,
    jobsReturned: 0,
    jobsInserted: 0,
    duplicates: 0,
    jobsFailed: 0,
    retries: 0,
    durationMs: 0,
    lastError: null
  };

  try {
    connection = await pool.getConnection();

    const options = {
      method: 'GET',
      url: 'https://jsearch.p.rapidapi.com/search-v2',
      params: { query: query.query_text, page: 1, num_pages: 2, date_posted: API_DATE_POSTED },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        'User-Agent': 'job-guide-match-ingestor/2.0',
        Accept: 'application/json'
      },
      validateStatus: () => true,
      timeout: API_TIMEOUT_MS
    };

    const { response, attempts } = await fetchWithRetry(options, query.query_text);
    result.retries = attempts - 1;

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Non-success response: HTTP ${response.status}`);
    }

    const jobs = extractJobs(response.data);
    result.jobsReturned = jobs.length;

    for (const rawJob of jobs) {
      try {
        const saved = await saveJob(connection, rawJob, {
          countryCode: query.country_code,
          countryName: country?.name || query.country_code,
          categorySlug: query.category_slug,
          categoryLabel: category?.label || query.category_slug
        });

        if (saved.status === 'inserted') result.jobsInserted += 1;
        else if (saved.status === 'updated') result.duplicates += 1;
        else result.jobsFailed += 1;
      } catch (error) {
        result.jobsFailed += 1;
        console.error(`Job failed but query continues. query_id=${query.id} job_id=${rawJob?.job_id || 'missing'}: ${error.message}`);
      }
    }

    result.success = true;
    console.log(`${query.country_code} ${query.category_slug} "${query.search_term}": returned=${result.jobsReturned} inserted=${result.jobsInserted} updated=${result.duplicates} failed_jobs=${result.jobsFailed}`);
  } catch (error) {
    result.lastError = error.message;
    console.error(`Query failed. query_id=${query.id} ${query.country_code} ${query.category_slug} "${query.search_term}": ${error.message}`);
  } finally {
    result.durationMs = Date.now() - started;
    if (connection) {
      try {
        await updateQueryStats(connection, query, result);
      } catch (error) {
        console.error(`Query stats update failed. query_id=${query.id}: ${error.message}`);
      }
      connection.release();
    }
  }

  return result;
}

async function runLimited(items, limit, worker) {
  const results = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
      if (QUERY_THROTTLE_MS > 0) await sleep(QUERY_THROTTLE_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

async function main() {
  const runStarted = Date.now();
  const batchSize = normalizeBatchSize();
  const concurrency = normalizeConcurrency();
  const summary = {
    selectedQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    jobsReturned: 0,
    newJobsInserted: 0,
    existingJobsUpdated: 0,
    jobsFailed: 0,
    byCountry: {}
  };
  let connection;

  try {
    connection = await pool.getConnection();
    await ensureDatabaseSchema(connection);

    const rapidApiKey = process.env.RAPIDAPI_KEY?.trim();
    if (!rapidApiKey) throw new Error('RAPIDAPI_KEY is missing from the environment.');

    const countryFilter = normalizeCountryFilter();
    const selectedQueries = await selectDueQueries(connection, batchSize, { countries: countryFilter });
    connection.release();
    connection = null;

    if (!selectedQueries.length) {
      console.log('Fetch run summary');
      if (countryFilter.length) console.log(`country filter: ${countryFilter.join(',')}`);
      console.log(`date posted: ${API_DATE_POSTED}`);
      console.log('selected queries: 0');
      console.log('successful queries: 0');
      console.log('failed queries: 0');
      console.log('jobs returned: 0');
      console.log('new jobs inserted: 0');
      console.log('existing jobs updated: 0');
      console.log('jobs failed: 0');
      console.log('total duration: 0s');
      console.log('by country: none');
      return;
    }

    const results = await runLimited(selectedQueries, concurrency, (query) => processQuery(query, rapidApiKey));
    for (const result of results) mergeSummary(summary, result);
  } catch (error) {
    console.error('Critical fetch error:', error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }

  const durationSeconds = Math.round((Date.now() - runStarted) / 1000);
  console.log('Fetch run summary');
  if (normalizeCountryFilter().length) console.log(`country filter: ${normalizeCountryFilter().join(',')}`);
  console.log(`date posted: ${API_DATE_POSTED}`);
  console.log(`selected queries: ${summary.selectedQueries}`);
  console.log(`successful queries: ${summary.successfulQueries}`);
  console.log(`failed queries: ${summary.failedQueries}`);
  console.log(`jobs returned: ${summary.jobsReturned}`);
  console.log(`new jobs inserted: ${summary.newJobsInserted}`);
  console.log(`existing jobs updated: ${summary.existingJobsUpdated}`);
  console.log(`jobs failed: ${summary.jobsFailed}`);
  console.log(`total duration: ${durationSeconds}s`);
  console.log('by country:');
  for (const countryCode of Object.keys(summary.byCountry).sort()) {
    const countrySummary = summary.byCountry[countryCode];
    console.log(`${countryCode}:`);
    console.log(`  queries: ${countrySummary.queries}`);
    console.log(`  returned: ${countrySummary.returned}`);
    console.log(`  inserted: ${countrySummary.inserted}`);
    console.log(`  updated: ${countrySummary.updated}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
