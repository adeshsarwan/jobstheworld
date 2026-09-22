'use client';

import Link from 'next/link';
import { ArrowUpRight, Briefcase, Clock, MapPin } from 'lucide-react';
import { ApplyLink } from './ApplyLink';
import { showThebesInterstitial } from '../lib/thebesClient';
import type { Job } from '../types/api';

let interstitialRequest: Promise<unknown> | null = null;

function prepareGoogleInterstitial() {
  if (!interstitialRequest) {
    interstitialRequest = showThebesInterstitial().catch((error) => {
      interstitialRequest = null;
      console.warn('Thebes interstitial failed', error);
    });
  }

  return interstitialRequest;
}

function formatSalary(job: Job) {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const period = job.salaryPeriod ? ` / ${job.salaryPeriod}` : '';
  if (job.salaryMin !== null && job.salaryMax !== null) return `${money.format(job.salaryMin)} - ${money.format(job.salaryMax)}${period}`;
  if (job.salaryMin !== null) return `${money.format(job.salaryMin)}+${period}`;
  return `Up to ${money.format(job.salaryMax as number)}${period}`;
}

function formatDate(value: string | null) {
  if (!value) return 'Recently posted';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

export function JobCard({ job }: { job: Job }) {
  const salary = formatSalary(job);
  const detailsHref = `/jobs/${job.slug}`;
  const interstitialLinkProps = {
    onFocus: prepareGoogleInterstitial,
    onMouseEnter: prepareGoogleInterstitial,
    onPointerDown: prepareGoogleInterstitial,
    onTouchStart: prepareGoogleInterstitial
  };

  return (
    <article className="job-card">
      <div className="job-card-main">
        <p className="eyebrow">{job.company.name}</p>
        <h3>
          <Link href={detailsHref} {...interstitialLinkProps}>{job.title}</Link>
        </h3>
        <div className="job-meta">
          <span><MapPin size={16} aria-hidden="true" />{job.location || 'Location not listed'}</span>
          <span><Briefcase size={16} aria-hidden="true" />{job.employmentType || 'Schedule varies'}</span>
          <span><Clock size={16} aria-hidden="true" />{formatDate(job.postedAt || job.lastSeenAt)}</span>
        </div>
        {salary ? <p className="salary">{salary}</p> : null}
      </div>
      <div className="job-actions">
        <Link className="secondary-button icon-button" href={detailsHref} {...interstitialLinkProps}>
          Details
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        {job.applyUrl ? (
          <ApplyLink applyUrl={job.applyUrl}>Apply</ApplyLink>
        ) : null}
      </div>
    </article>
  );
}
