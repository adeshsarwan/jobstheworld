import { notFound } from 'next/navigation';
import { Briefcase, MapPin } from 'lucide-react';
import { AdPlaceholder } from '../../../components/AdPlaceholder';
import { RewardedApplyGate } from '../../../components/RewardedApplyGate';
import { getJob } from '../../../lib/api';

function formatSalary(salaryMin: number | null, salaryMax: number | null, period: string | null) {
  if (salaryMin === null && salaryMax === null) return 'Salary not listed';
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const suffix = period ? ` / ${period}` : '';
  if (salaryMin !== null && salaryMax !== null) return `${money.format(salaryMin)} - ${money.format(salaryMax)}${suffix}`;
  if (salaryMin !== null) return `${money.format(salaryMin)}+${suffix}`;
  return `Up to ${money.format(salaryMax as number)}${suffix}`;
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  let job;

  try {
    const { slug } = await params;
    job = await getJob(slug);
  } catch {
    notFound();
  }

  return (
    <main className="page-shell job-detail-shell">
      <section className="job-detail">
        <p className="eyebrow">{job.company.name}</p>
        <h1>{job.title}</h1>
        <div className="job-meta detail-meta">
          <span><MapPin size={16} aria-hidden="true" />{job.location || 'Location not listed'}</span>
          <span><Briefcase size={16} aria-hidden="true" />{job.employmentType || 'Schedule varies'}</span>
          <span>{formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}</span>
        </div>
        {job.applyUrl ? <RewardedApplyGate applyUrl={job.applyUrl} /> : null}
        <div className="description">
          {(job.description || 'No description is available for this job.').split('\n').map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
        <p className="disclaimer">Job Guide Match links to external application pages. Review the employer page before sharing personal information.</p>
      </section>
      <AdPlaceholder placement="sidebar" />
    </main>
  );
}
