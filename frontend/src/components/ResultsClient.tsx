'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { matcherQuestions, optionLabel } from '../config/matcherQuestions';
import { readAnswers } from '../lib/matcherState';
import { getJobs } from '../lib/api';
import type { JobListResult } from '../types/api';
import { AdPlaceholder } from './AdPlaceholder';
import { JobCard } from './JobCard';
import { SearchBox } from './SearchBox';

const countries = [
  { code: '', name: 'All supported countries' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'IN', name: 'India' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'QA', name: 'Qatar' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'OM', name: 'Oman' },
  { code: 'BH', name: 'Bahrain' }
];

function applyAnswers(params: URLSearchParams) {
  const answers = readAnswers();
  if (answers.work && !params.has('category')) params.set('category', answers.work);
  if (answers.location === 'Remote' && !params.has('remote')) params.set('remote', 'true');
  if (answers.schedule && answers.schedule !== 'Flexible / any' && !params.has('employment_type')) {
    params.set('employment_type', answers.schedule);
  }
  if (answers.experience && !params.has('experience_level')) params.set('experience_level', answers.experience);
  return answers;
}

export function ResultsClient() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<JobListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [country, setCountry] = useState(searchParams.get('country') || '');

  const filters = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    const answers = applyAnswers(params);
    if (country) params.set('country', country);
    else params.delete('country');
    params.set('page', String(page));
    params.set('limit', params.get('limit') || '10');
    return { params, answers };
  }, [searchParams, page, country]);

  useEffect(() => {
    let active = true;
    setError(null);
    getJobs(filters.params)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((caught: Error) => {
        if (active) setError(caught.message);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  return (
    <main className="page-shell results-shell">
      <section className="results-header">
        <p className="eyebrow">Matched jobs</p>
        <h1>Jobs that fit what you picked</h1>
        <SearchBox defaultValue={searchParams.get('q') || ''} />
        <label className="country-filter">
          <span>Country</span>
          <select value={country} onChange={(event) => setCountry(event.target.value)}>
            {countries.map((item) => (
              <option key={item.code || 'all'} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
        <div className="answer-strip" aria-label="Current filters">
          {matcherQuestions.map((question) => {
            const value = filters.answers[question.key];
            return value ? <span key={question.key}>{optionLabel(question.key, value)}</span> : null;
          })}
        </div>
      </section>

      <div className="results-layout">
        <section className="job-list" aria-live="polite">
          {error ? <div className="empty-state">The backend is not reachable yet.</div> : null}
          {!error && !result ? <div className="empty-state">Loading jobs...</div> : null}
          {result && result.jobs.length === 0 ? (
            <div className="empty-state">No jobs matched those filters yet.</div>
          ) : null}
          {result?.jobs.map((job) => <JobCard key={job.id} job={job} />)}

          {result ? (
            <div className="pagination" aria-label="Pagination">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                <ChevronLeft size={16} aria-hidden="true" />
                Previous
              </button>
              <span>{result.pagination.page} / {result.pagination.totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(result.pagination.totalPages, current + 1))}
                disabled={page >= result.pagination.totalPages}
              >
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
        <AdPlaceholder placement="sidebar" />
      </div>
    </main>
  );
}
