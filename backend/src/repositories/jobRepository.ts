import type { Pool } from 'mysql2/promise';
import { pool as defaultPool } from '../config/database.js';
import type { CategoryResult, Job, JobListResult } from '../models/job.js';

export interface RepositoryJobFilters {
  q?: string;
  categoryValues?: string[];
  categoryTerms?: string[];
  country?: string;
  city?: string;
  state?: string;
  remote?: boolean;
  employmentTypeValues?: string[];
  experienceTerms?: string[];
  page: number;
  limit: number;
}

interface JobRow {
  id: number;
  slug: string;
  title: string;
  companyId: number;
  companyName: string;
  companyLogoUrl: string | null;
  category: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employmentType: string | null;
  isRemote: number;
  salaryMin: string | number | null;
  salaryMax: string | number | null;
  salaryPeriod: string | null;
  postedAt: Date | string | null;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
  description?: string | null;
  applyUrl?: string | null;
}

const baseSelect = `
  SELECT
    j.id,
    j.slug,
    j.title,
    j.company_id AS companyId,
    c.name AS companyName,
    c.logo_url AS companyLogoUrl,
    j.category,
    j.location,
    j.city,
    j.state,
    j.country,
    j.employment_type AS employmentType,
    j.is_remote AS isRemote,
    j.salary_min AS salaryMin,
    j.salary_max AS salaryMax,
    j.salary_period AS salaryPeriod,
    j.posted_at AS postedAt,
    j.first_seen_at AS firstSeenAt,
    j.last_seen_at AS lastSeenAt
`;

const baseFrom = `
  FROM jobs j
  INNER JOIN companies c ON c.id = j.company_id
`;

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function decimal(value: string | number | null) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapJob(row: JobRow): Job {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    company: {
      id: Number(row.companyId),
      name: row.companyName,
      logoUrl: row.companyLogoUrl
    },
    category: row.category,
    location: row.location,
    city: row.city,
    state: row.state,
    country: row.country,
    employmentType: row.employmentType,
    isRemote: Boolean(row.isRemote),
    salaryMin: decimal(row.salaryMin),
    salaryMax: decimal(row.salaryMax),
    salaryPeriod: row.salaryPeriod,
    postedAt: iso(row.postedAt),
    firstSeenAt: iso(row.firstSeenAt) ?? new Date().toISOString(),
    lastSeenAt: iso(row.lastSeenAt) ?? new Date().toISOString(),
    description: row.description,
    applyUrl: row.applyUrl
  };
}

type SqlParam = string | number | boolean | Date | null;

function pushLike(params: SqlParam[], value: string) {
  params.push(`%${value}%`);
}

function buildWhere(filters: RepositoryJobFilters) {
  const clauses = ['j.active = 1'];
  const params: SqlParam[] = [];

  if (filters.q) {
    const fields = ['j.title', 'c.name', 'j.location', 'j.description'];
    clauses.push(`(${fields.map((field) => `${field} LIKE ?`).join(' OR ')})`);
    fields.forEach(() => pushLike(params, filters.q as string));
  }

  if (filters.categoryValues?.length || filters.categoryTerms?.length) {
    const categoryClauses = [];
    if (filters.categoryValues?.length) {
      categoryClauses.push(`j.category IN (${filters.categoryValues.map(() => '?').join(', ')})`);
      params.push(...filters.categoryValues);
    }
    for (const term of filters.categoryTerms || []) {
      categoryClauses.push('(j.title LIKE ? OR j.description LIKE ? OR j.category LIKE ?)');
      pushLike(params, term);
      pushLike(params, term);
      pushLike(params, term);
    }
    clauses.push(`(${categoryClauses.join(' OR ')})`);
  }

  if (filters.country) {
    clauses.push('j.country = ?');
    params.push(filters.country);
  }

  if (filters.city) {
    clauses.push('j.city LIKE ?');
    pushLike(params, filters.city);
  }

  if (filters.state) {
    clauses.push('j.state LIKE ?');
    pushLike(params, filters.state);
  }

  if (typeof filters.remote === 'boolean') {
    clauses.push('j.is_remote = ?');
    params.push(filters.remote ? 1 : 0);
  }

  if (filters.employmentTypeValues?.length) {
    clauses.push(`j.employment_type IN (${filters.employmentTypeValues.map(() => '?').join(', ')})`);
    params.push(...filters.employmentTypeValues);
  }

  if (filters.experienceTerms?.length) {
    const experienceClauses = [];
    for (const term of filters.experienceTerms) {
      experienceClauses.push('(j.title LIKE ? OR j.description LIKE ?)');
      pushLike(params, term);
      pushLike(params, term);
    }
    clauses.push(`(${experienceClauses.join(' OR ')})`);
  }

  return { sql: `WHERE ${clauses.join(' AND ')}`, params };
}

export class JobRepository {
  constructor(private readonly db: Pool = defaultPool) {}

  async findJobs(filters: RepositoryJobFilters): Promise<JobListResult> {
    const page = Math.max(1, filters.page);
    const limit = Math.min(Math.max(1, filters.limit), 100);
    const offset = (page - 1) * limit;
    const where = buildWhere(filters);

    const [countRows] = await this.db.execute(
      `SELECT COUNT(*) AS total ${baseFrom} ${where.sql}`,
      where.params
    );
    const total = Number((countRows as Array<{ total: number }>)[0]?.total || 0);

    const [rows] = await this.db.execute(
      `${baseSelect}
       ${baseFrom}
       ${where.sql}
       ORDER BY COALESCE(j.posted_at, j.last_seen_at, j.created_at) DESC, j.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      where.params
    );

    return {
      jobs: (rows as JobRow[]).map(mapJob),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async findJobBySlug(slug: string): Promise<Job | null> {
    const [rows] = await this.db.execute(
      `${baseSelect},
          j.description,
          j.redirect_url AS applyUrl
       ${baseFrom}
       WHERE j.active = 1 AND j.slug = ?
       LIMIT 1`,
      [slug]
    );

    const row = (rows as JobRow[])[0];
    return row ? mapJob(row) : null;
  }

  async findCategories(): Promise<CategoryResult[]> {
    const [rows] = await this.db.execute(
      `SELECT COALESCE(category, 'uncategorized') AS value, COALESCE(category, 'Uncategorized') AS label, COUNT(*) AS count
         FROM jobs
        WHERE active = 1
        GROUP BY COALESCE(category, 'uncategorized')
        ORDER BY count DESC, label ASC`
    );

    return (rows as Array<{ value: string; label: string; count: number }>).map((row) => ({
      value: row.value,
      label: row.label,
      count: Number(row.count)
    }));
  }
}
