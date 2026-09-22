import { describe, expect, it } from 'vitest';
import { saveJob } from '../src/persist-job.js';

class FakeConnection {
  constructor() {
    this.companyIds = new Map();
    this.jobs = new Map();
    this.nextCompanyId = 1;
  }

  async execute(sql, params) {
    if (sql.includes('SELECT id FROM jobs WHERE source_hash')) {
      return [this.jobs.has(params[0]) ? [{ id: 1 }] : []];
    }

    if (sql.includes('INSERT INTO companies')) {
      const name = params[0];
      if (!this.companyIds.has(name)) {
        this.companyIds.set(name, this.nextCompanyId);
        this.nextCompanyId += 1;
      }
      return [{ insertId: this.companyIds.get(name) }];
    }

    if (sql.includes('INSERT INTO jobs')) {
      const sourceHash = params[2];
      this.jobs.set(sourceHash, params);
      return [{ affectedRows: 1 }];
    }

    return [[]];
  }
}

describe('ingestion dedupe key', () => {
  it('repeat fetch does not insert duplicate source jobs', async () => {
    const connection = new FakeConnection();
    const rawJob = {
      job_id: 'same-source-job',
      job_title: 'Warehouse Associate',
      employer_name: 'Example Employer',
      job_location: 'Chicago, IL',
      job_city: 'Chicago',
      job_state: 'IL',
      job_country: 'US',
      job_description: 'Pick and pack orders.',
      job_apply_link: 'https://example.com/apply'
    };
    const target = { category: 'warehouse-logistics' };

    const first = await saveJob(connection, rawJob, target);
    const second = await saveJob(connection, rawJob, target);

    expect(first.sourceHash).toEqual(second.sourceHash);
    expect(first.status).toBe('inserted');
    expect(second.status).toBe('updated');
    expect(connection.jobs.size).toBe(1);
  });
});
