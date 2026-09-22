import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Briefcase, Clock, DollarSign, MapPin } from 'lucide-react';
import { CompanyJobsClient } from '../../../components/CompanyJobsClient';
import { AdPlaceholder } from '../../../components/AdPlaceholder';
import { featuredCompanies, getFeaturedCompany } from '../../../config/featuredCompanies';

export function generateStaticParams() {
  return featuredCompanies.map((company) => ({ slug: company.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const company = getFeaturedCompany(slug);
  if (!company) return {};

  return {
    title: `${company.name} Jobs | Job Guide Match`,
    description: `${company.summary} Browse current ${company.name} jobs and apply on official posting pages.`
  };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = getFeaturedCompany(slug);
  if (!company) notFound();

  return (
    <main className="page-shell company-detail-shell">
      <article className="company-detail-card">
        <div className={`company-logo-tile ${company.colorClass}`} aria-hidden="true">
          <span>{company.initials}</span>
        </div>
        <p className="eyebrow">{company.name} careers</p>
        <h1>{company.headline}</h1>
        <p className="company-lede">{company.summary}</p>

        <div className="company-stat-grid" aria-label={`${company.name} job summary`}>
          <div>
            <Briefcase size={22} aria-hidden="true" />
            <strong>{company.openingsLabel}</strong>
            <span>Openings</span>
          </div>
          <div>
            <DollarSign size={22} aria-hidden="true" />
            <strong>{company.payRange}</strong>
            <span>Typical pay range</span>
          </div>
          <div>
            <Clock size={22} aria-hidden="true" />
            <strong>{company.schedule}</strong>
            <span>Schedule</span>
          </div>
          <div>
            <MapPin size={22} aria-hidden="true" />
            <strong>{company.where}</strong>
            <span>Where</span>
          </div>
        </div>

        <div className="company-native-ad-row">
          <AdPlaceholder placement="native" />
        </div>

        <section className="company-copy">
          <h2>Common roles</h2>
          <ul className="check-list">
            {company.roles.map((role) => <li key={role}>{role}</li>)}
          </ul>
        </section>

        <section className="company-copy">
          <h2>How to apply</h2>
          <ol className="steps-list">
            {company.applySteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
      </article>

      <section className="company-openings-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Current listings</p>
            <h2>{company.name} jobs on Job Guide Match</h2>
          </div>
          <Link className="secondary-button icon-button" href={`/find/results?q=${encodeURIComponent(company.searchQuery)}`}>
            View all
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <CompanyJobsClient query={company.searchQuery} />
      </section>
    </main>
  );
}
