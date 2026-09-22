import { normalizeJob } from './job-normalizer.js';

export async function saveJob(connection, rawJob, target) {
  const job = normalizeJob(rawJob, target);
  if (!job) return { status: 'skipped', reason: 'missing_source_id' };

  const [existingRows] = await connection.execute(
    `SELECT id FROM jobs WHERE source_hash = ? LIMIT 1`,
    [job.sourceHash]
  );
  const existed = existingRows.length > 0;

  const [companyResult] = await connection.execute(
    `INSERT INTO companies (name, logo_url) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), logo_url = VALUES(logo_url)`,
    [job.companyName, job.companyLogoUrl]
  );

  await connection.execute(
    `INSERT INTO jobs (
       api_source, source_id, source_hash, slug, title, company_id, category,
       location, city, state, country, employment_type, is_remote,
       description, redirect_url, salary_min, salary_max, salary_period, posted_at,
       raw_payload, first_seen_at, last_seen_at, active, removed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), NOW(), NOW(), 1, NULL)
     ON DUPLICATE KEY UPDATE
       source_id = VALUES(source_id),
       slug = COALESCE(NULLIF(slug, ''), VALUES(slug)),
       title = VALUES(title),
       company_id = VALUES(company_id),
       category = VALUES(category),
       location = VALUES(location),
       city = VALUES(city),
       state = VALUES(state),
       country = VALUES(country),
       employment_type = VALUES(employment_type),
       is_remote = VALUES(is_remote),
       description = VALUES(description),
       redirect_url = VALUES(redirect_url),
       salary_min = VALUES(salary_min),
       salary_max = VALUES(salary_max),
       salary_period = VALUES(salary_period),
       posted_at = VALUES(posted_at),
       raw_payload = VALUES(raw_payload),
       last_seen_at = NOW(),
       active = 1,
       removed_at = NULL`,
    [
      job.apiSource,
      job.sourceId,
      job.sourceHash,
      job.slug,
      job.title,
      companyResult.insertId,
      job.category,
      job.location,
      job.city,
      job.state,
      job.country,
      job.employmentType,
      job.isRemote,
      job.description,
      job.redirectUrl,
      job.salaryMin,
      job.salaryMax,
      job.salaryPeriod,
      job.postedAt,
      job.rawPayload
    ]
  );

  return { status: existed ? 'updated' : 'inserted', sourceHash: job.sourceHash, slug: job.slug };
}
