import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, MessageCircle, Search } from 'lucide-react';
import { AdPlaceholder } from '../components/AdPlaceholder';
import { SearchBox } from '../components/SearchBox';
import { featuredCompanies } from '../config/featuredCompanies';

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">Job Guide Match</p>
          <h1>Find practical work that fits your life.</h1>
          <p className="hero-text">Search real listings, answer four quick questions, or use a guided chat to narrow the list.</p>
          <SearchBox />
          <div className="hero-actions">
            <Link className="primary-button icon-button" href="/find/work">
              <Search size={18} aria-hidden="true" />
              Find my job
            </Link>
            <Link className="secondary-button icon-button" href="/chat">
              <MessageCircle size={18} aria-hidden="true" />
              Chat to find jobs
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="hero-panel" aria-hidden="true">
          <div className="mini-card blue">
            <span>Warehouse</span>
            <strong>Full-time</strong>
          </div>
          <div className="mini-card green">
            <span>Remote</span>
            <strong>Customer support</strong>
          </div>
          <div className="mini-card amber">
            <span>Delivery</span>
            <strong>Flexible</strong>
          </div>
        </div>
      </section>
      <section className="company-section" aria-labelledby="companies-heading">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Companies hiring now</p>
            <h2 id="companies-heading">Browse jobs from well-known employers</h2>
          </div>
          <Link className="secondary-button icon-button" href="/find/results">
            See all jobs
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <div className="company-card-grid">
          {featuredCompanies.slice(0, 3).map((company) => (
            <Link className="company-card" href={`/companies/${company.slug}`} key={company.slug}>
              <span className="status-pill">Now hiring</span>
              <div className={`company-logo-band ${company.colorClass}`}>
                <span>{company.initials}</span>
              </div>
              <div className="company-card-body">
                <span className="pay-pill">{company.payRange}</span>
                <h3>{company.headline}</h3>
                <p><BriefcaseBusiness size={16} aria-hidden="true" />{company.category}</p>
                <span className="company-card-link">
                  View openings
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}

          <div className="native-company-ad">
            <AdPlaceholder placement="native" />
          </div>

          {featuredCompanies.slice(3).map((company) => (
            <Link className="company-card" href={`/companies/${company.slug}`} key={company.slug}>
              <span className="status-pill">Now hiring</span>
              <div className={`company-logo-band ${company.colorClass}`}>
                <span>{company.initials}</span>
              </div>
              <div className="company-card-body">
                <span className="pay-pill">{company.payRange}</span>
                <h3>{company.headline}</h3>
                <p><BriefcaseBusiness size={16} aria-hidden="true" />{company.category}</p>
                <span className="company-card-link">
                  View openings
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
