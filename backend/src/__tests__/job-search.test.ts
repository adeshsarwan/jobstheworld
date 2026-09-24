import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../app.js';
import { JobRepository } from '../repositories/jobRepository.js';
import { JobService } from '../services/jobService.js';

function setup(total = 0) {
  const execute = vi.fn().mockResolvedValueOnce([[{ total }]]).mockResolvedValueOnce([[]]);
  const operation = vi.fn().mockRejectedValue(new Error('Unexpected refresh'));
  const app = createApp({ jobService: new JobService(new JobRepository({ execute } as unknown as Pool)), inventoryOperation: operation });
  return { app, execute, operation };
}
afterEach(() => vi.unstubAllGlobals());
describe('normalized stored job search', () => {
  it.each([
    ['country=us', 'j.country = ?', ['US']],
    ['country=za', 'j.country = ?', ['ZA']],
    ['category=warehouse-logistics', 'j.category IN', ['warehouse-logistics', 'blue_collar']],
    ['q=%20customer%20service%20', 'j.title LIKE ?', ['%customer service%']],
    ['city=%20New%20York%20&state=NY', 'j.city LIKE ? AND j.state LIKE ?', ['%New York%', '%NY%']],
    ['remote=true', 'j.is_remote = ?', [1]],
    ['remote=0', 'j.is_remote = ?', [0]],
    ['employment_type=full-time', 'j.employment_type IN', ['Full-time']],
    ['experience_level=entry-level', 'j.description LIKE ?', ['%trainee%']],
    ['experience_level=mid-level', 'j.description LIKE ?', ['%intermediate%']],
    ['experience_level=senior', 'j.description LIKE ?', ['%senior%']]
  ])('binds %s into both active-only SQL queries', async (query, clause, values) => {
    const { app, execute } = setup();
    await request(app).get(`/api/jobs/search?${query}`).expect(200);
    expect(execute).toHaveBeenCalledTimes(2);
    for (const [sql, params] of execute.mock.calls) {
      expect(sql).toContain('j.active = 1'); expect(sql).toContain(clause);
      expect(params).toEqual(expect.arrayContaining<string | number>(values));
    }
  });
  it('uses deterministic SQL ordering and correct offsets/totals', async () => {
    const { app, execute } = setup(41);
    const response = await request(app).get('/api/jobs/search?page=2&limit=20').expect(200);
    expect(execute.mock.calls[1][0]).toContain('ORDER BY j.posted_at DESC, j.id DESC');
    expect(execute.mock.calls[1][0]).toContain('LIMIT 20 OFFSET 20');
    expect(response.body.data.pagination).toEqual({ page: 2, limit: 20, total: 41, totalPages: 3 });
  });
  it('returns zero pages when empty and never treats search as a slug', async () => {
    const { app, execute } = setup();
    const response = await request(app).get('/api/jobs/search').expect(200);
    expect(response.body).toEqual({ success: true, data: { jobs: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
    expect(execute.mock.calls[1][0]).not.toContain('j.slug =');
  });
  it.each(['country=ZZ', 'country=USA', 'remote=yes', 'remote=maybe', 'remote=', 'page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=9007199254740992', 'page=9007199254740991&limit=100', 'limit=0', 'limit=101', 'limit=', 'category=unknown', 'employment_type=any', 'experience_level=unknown', 'q=%20', 'city=', 'page=1&page=2', 'country[]=US', 'unknown=x'])('rejects %s without querying storage', async query => {
    const { app, execute } = setup();
    const response = await request(app).get(`/api/jobs/search?${query}`).expect(400);
    expect(response.body).toEqual({ success: false, error: 'Invalid request' });
    expect(response.headers['cache-control']).toBe('no-store'); expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    ['', 300], ['remote=true', 300], ['country=US', 1800], ['category=retail-store', 1800],
    ['city=Boston', 900], ['state=NY&country=US', 900], ['q=service&city=Boston&country=US', 300]
  ])('selects cache TTL for %s', async (query, ttl) => {
    const { app } = setup();
    const response = await request(app).get(`/api/jobs/search?${query}`).expect(200);
    expect(response.headers['cache-control']).toBe(`public, max-age=0, s-maxage=${ttl}, must-revalidate`);
  });
  it('does not cache database errors', async () => {
    const { app, execute } = setup(); execute.mockReset().mockRejectedValue(new Error('DB unavailable'));
    const response = await request(app).get('/api/jobs/search').expect(500);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('never calls upstream fetch or the refresh operation', async () => {
    const fetch = vi.fn(() => { throw new Error('Unexpected upstream'); }); vi.stubGlobal('fetch', fetch);
    const { app, operation, execute } = setup();
    await request(app).get('/api/jobs/search?country=US').expect(200);
    expect(execute).toHaveBeenCalledTimes(2); expect(fetch).not.toHaveBeenCalled(); expect(operation).not.toHaveBeenCalled();
  });
  it('returns the existing normalized public Job model', async () => {
    const { app, execute } = setup();
    execute.mockReset().mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([[{
      id: 465, slug: 'shipping-receiving-clerk-70d9e218', title: 'Shipping/Receiving Clerk',
      companyId: 466, companyName: 'Metals USA', companyLogoUrl: null,
      category: 'warehouse-logistics', location: 'Torrington, CT', city: 'Torrington', state: 'Connecticut', country: 'US',
      employmentType: 'Full-time', isRemote: 0, salaryMin: '22', salaryMax: '24', salaryPeriod: 'HOUR',
      postedAt: null, firstSeenAt: '2026-07-25T13:29:09Z', lastSeenAt: '2026-07-25T13:29:09Z'
    }]]);
    const response = await request(app).get('/api/jobs/search?country=US').expect(200);
    expect(response.body.data.jobs[0]).toMatchObject({ id: 465, company: { id: 466, name: 'Metals USA', logoUrl: null }, isRemote: false, salaryMin: 22, postedAt: null });
    expect(response.body.data.jobs[0]).not.toHaveProperty('companyId');
  });
  it('binds hostile text instead of interpolating it into SQL', async () => {
    const { app, execute } = setup();
    const q = "' OR 1=1 --";
    await request(app).get('/api/jobs/search').query({ q }).expect(200);
    expect(execute.mock.calls[1][0]).not.toContain(q);
    expect(execute.mock.calls[1][1]).toContain(`%${q}%`);
  });
  it('preserves legacy ordering and empty pagination', async () => {
    const { app, execute } = setup();
    const response = await request(app).get('/api/jobs').expect(200);
    expect(response.body.data.pagination.totalPages).toBe(1);
    expect(execute.mock.calls[1][0]).toContain('ORDER BY COALESCE(j.posted_at, j.last_seen_at, j.created_at) DESC, j.id DESC');
  });
});
