import { describe, expect, it } from 'vitest';
import countries from '../config/countries.js';
import categories from '../config/categories.js';
import { normalizeCountryCode, resolveJobCountry } from '../src/country-utils.js';
import { generateQueries } from '../src/query-generator.js';
import { normalizeBatchSize, normalizeConcurrency, nextRunHoursForResult } from '../src/query-settings.js';
import { syncQueries } from '../src/query-sync.js';

class FakeQuerySyncConnection {
  constructor() {
    this.rows = new Map();
  }

  async execute(sql, params = []) {
    if (sql.includes('INSERT INTO job_ingestion_queries')) {
      const [countryCode, categorySlug, searchTerm, queryText, priority] = params;
      const key = `${countryCode}:${categorySlug}:${searchTerm}`;
      const existing = this.rows.get(key) || { run_count: 7, total_jobs_saved: 11 };
      this.rows.set(key, {
        ...existing,
        country_code: countryCode,
        category_slug: categorySlug,
        search_term: searchTerm,
        query_text: queryText,
        priority
      });
      return [{ affectedRows: existing.country_code ? 2 : 1 }];
    }

    if (sql.includes('SELECT COUNT(*) AS total')) {
      return [[{ total: this.rows.size, enabled: this.rows.size }]];
    }

    return [[]];
  }
}

describe('phase 2 ingestion configuration', () => {
  it('country configuration contains the 12 configured countries', () => {
    expect(countries).toHaveLength(12);
    expect(countries.map((country) => country.code)).toEqual(['US', 'GB', 'CA', 'IN', 'NG', 'ZA', 'AE', 'SA', 'QA', 'KW', 'OM', 'BH']);
  });

  it('category configuration contains exactly 20 categories', () => {
    expect(categories).toHaveLength(20);
    expect(categories.every((category) => category.queries.length === 8)).toBe(true);
  });

  it('query generator produces exactly 1,629 combinations', () => {
    expect(generateQueries()).toHaveLength(1629);
  });

  it('query text format is correct', () => {
    const queries = generateQueries();
    expect(queries[0]).toMatchObject({
      countryCode: 'US',
      categorySlug: 'warehouse-logistics',
      searchTerm: 'warehouse associate',
      query: 'warehouse associate jobs in United States'
    });
  });

  it('query sync is idempotent and keeps statistics fields untouched', async () => {
    const connection = new FakeQuerySyncConnection();
    await syncQueries(connection);
    await syncQueries(connection);

    expect(connection.rows.size).toBe(1629);
    expect([...connection.rows.values()].every((row) => row.run_count === 7 && row.total_jobs_saved === 11)).toBe(true);
  });

  it('batch size defaults to 40 and cannot exceed 100', () => {
    expect(normalizeBatchSize(undefined)).toBe(40);
    expect(normalizeBatchSize('250')).toBe(100);
  });

  it('concurrency defaults to 2 and cannot exceed 3', () => {
    expect(normalizeConcurrency(undefined)).toBe(2);
    expect(normalizeConcurrency('10')).toBe(3);
  });

  it('normalizes supported country values', () => {
    expect(normalizeCountryCode('United States')).toBe('US');
    expect(normalizeCountryCode('UK')).toBe('GB');
    expect(normalizeCountryCode('UAE')).toBe('AE');
    expect(resolveJobCountry(null, 'IN')).toBe('IN');
    expect(resolveJobCountry('France', 'US')).toBeNull();
  });

  it('next_run_at delay rules match saved-job counts', () => {
    expect(nextRunHoursForResult({ jobsSaved: 10 })).toBe(6);
    expect(nextRunHoursForResult({ jobsSaved: 3 })).toBe(12);
    expect(nextRunHoursForResult({ jobsSaved: 1 })).toBe(24);
    expect(nextRunHoursForResult({ jobsSaved: 0 })).toBe(72);
    expect(nextRunHoursForResult({ failed: true, jobsSaved: 99 })).toBe(6);
  });
});
