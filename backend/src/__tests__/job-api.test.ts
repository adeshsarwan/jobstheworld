import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { CategoryResult, Job, JobListResult } from '../models/job.js';
import type { RepositoryJobFilters } from '../repositories/jobRepository.js';
import { JobService, type JobRepositoryLike } from '../services/jobService.js';

interface FixtureJob extends Job {
  active: boolean;
}

const fixtures: FixtureJob[] = [
  {
    id: 1,
    slug: 'warehouse-associate',
    title: 'Entry Warehouse Associate',
    company: { id: 1, name: 'Blue Line Logistics', logoUrl: null },
    category: 'warehouse-logistics',
    location: 'Chicago, IL',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    employmentType: 'Full-time',
    isRemote: false,
    salaryMin: 18,
    salaryMax: 22,
    salaryPeriod: 'hour',
    postedAt: '2026-07-20T00:00:00.000Z',
    firstSeenAt: '2026-07-20T00:00:00.000Z',
    lastSeenAt: '2026-07-25T00:00:00.000Z',
    description: 'Entry-level warehouse role with training.',
    applyUrl: 'https://example.com/warehouse',
    active: true
  },
  {
    id: 2,
    slug: 'remote-support-specialist',
    title: 'Remote Customer Support Specialist',
    company: { id: 2, name: 'Help Desk Co', logoUrl: null },
    category: 'customer-service',
    location: 'Remote',
    city: null,
    state: null,
    country: 'CA',
    employmentType: 'Part-time',
    isRemote: true,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    postedAt: '2026-07-21T00:00:00.000Z',
    firstSeenAt: '2026-07-21T00:00:00.000Z',
    lastSeenAt: '2026-07-25T00:00:00.000Z',
    description: 'Customer service from home.',
    applyUrl: 'https://example.com/support',
    active: true
  },
  {
    id: 3,
    slug: 'inactive-job',
    title: 'Inactive Job',
    company: { id: 3, name: 'Old Co', logoUrl: null },
    category: 'warehouse-logistics',
    location: 'Chicago, IL',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    employmentType: 'Full-time',
    isRemote: false,
    salaryMin: null,
    salaryMax: null,
    salaryPeriod: null,
    postedAt: null,
    firstSeenAt: '2026-07-01T00:00:00.000Z',
    lastSeenAt: '2026-07-01T00:00:00.000Z',
    description: 'Inactive row.',
    applyUrl: null,
    active: false
  }
];

class FakeJobRepository implements JobRepositoryLike {
  async findJobs(filters: RepositoryJobFilters): Promise<JobListResult> {
    let rows = fixtures.filter((job) => job.active);

    if (filters.categoryValues?.length) {
      rows = rows.filter((job) => filters.categoryValues?.includes(job.category || ''));
    }
    if (filters.country) {
      rows = rows.filter((job) => job.country === filters.country);
    }
    if (filters.city) {
      rows = rows.filter((job) => job.city?.toLowerCase().includes(filters.city!.toLowerCase()));
    }
    if (typeof filters.remote === 'boolean') {
      rows = rows.filter((job) => job.isRemote === filters.remote);
    }
    if (filters.employmentTypeValues?.length) {
      rows = rows.filter((job) => filters.employmentTypeValues?.includes(job.employmentType || ''));
    }
    if (filters.experienceTerms?.length) {
      rows = rows.filter((job) => filters.experienceTerms?.some((term) => (
        job.title.toLowerCase().includes(term) ||
        job.description?.toLowerCase().includes(term)
      )));
    }

    const page = filters.page;
    const limit = filters.limit;
    const start = (page - 1) * limit;
    const jobs = rows.slice(start, start + limit).map(({ active: _active, ...job }) => job);

    return {
      jobs,
      pagination: {
        page,
        limit,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / limit))
      }
    };
  }

  async findJobBySlug(slug: string): Promise<Job | null> {
    const job = fixtures.find((fixture) => fixture.slug === slug && fixture.active);
    if (!job) return null;
    const { active: _active, ...publicJob } = job;
    return publicJob;
  }

  async findCategories(): Promise<CategoryResult[]> {
    return [];
  }
}

function app() {
  return createApp({ jobService: new JobService(new FakeJobRepository()) });
}

describe('job API', () => {
  it('returns paginated jobs', async () => {
    const response = await request(app()).get('/api/jobs?page=2&limit=1').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it('applies job filters', async () => {
    const response = await request(app()).get('/api/jobs?category=warehouse-logistics&city=Chicago').expect(200);

    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.jobs[0].slug).toBe('warehouse-associate');
  });

  it('applies country API filtering', async () => {
    const response = await request(app()).get('/api/jobs?country=US').expect(200);

    expect(response.body.data.jobs).toHaveLength(1);
    expect(response.body.data.jobs[0].country).toBe('US');
  });

  it('returns the 20 configured categories', async () => {
    const response = await request(app()).get('/api/categories').expect(200);

    expect(response.body.data).toHaveLength(20);
    expect(response.body.data.map((category: { value: string }) => category.value)).toContain('engineering');
  });

  it('excludes inactive jobs', async () => {
    const response = await request(app()).get('/api/jobs?category=warehouse-logistics').expect(200);

    expect(response.body.data.jobs.map((job: Job) => job.slug)).not.toContain('inactive-job');
  });

  it('returns matching jobs from the match endpoint', async () => {
    const response = await request(app())
      .post('/api/match')
      .send({
        answers: {
          work: 'Warehouse & Logistics',
          location: 'In my local area',
          schedule: 'Full-time',
          experience: 'No experience / entry level'
        },
        city: 'Chicago'
      })
      .expect(200);

    expect(response.body.data.jobs[0].slug).toBe('warehouse-associate');
  });

  it('returns a job detail by slug', async () => {
    const response = await request(app()).get('/api/jobs/warehouse-associate').expect(200);

    expect(response.body.data.title).toBe('Entry Warehouse Associate');
    expect(response.body.data.applyUrl).toBe('https://example.com/warehouse');
  });
});
