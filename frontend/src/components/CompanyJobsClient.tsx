'use client';

import { useEffect, useMemo, useState } from 'react';
import { getJobs } from '../lib/api';
import type { JobListResult } from '../types/api';
import { JobCard } from './JobCard';

export function CompanyJobsClient({ query }: { query: string }) {
  const params = useMemo(() => {
    const next = new URLSearchParams();
    next.set('q', query);
    next.set('limit', '6');
    return next;
  }, [query]);
  const [result, setResult] = useState<JobListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    getJobs(params)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      });

    return () => {
      active = false;
    };
  }, [params]);

  if (error) return <div className="empty-state">Jobs are temporarily unavailable.</div>;
  if (!result) return <div className="empty-state">Loading jobs...</div>;
  if (!result.jobs.length) return <div className="empty-state">No current jobs matched this company yet.</div>;

  return (
    <div className="job-list company-job-list">
      {result.jobs.map((job) => <JobCard key={job.id} job={job} />)}
    </div>
  );
}
