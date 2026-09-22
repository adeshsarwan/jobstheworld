import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use | Job Guide Match',
  description: 'Terms of Use for Job Guide Match.'
};

export default function TermsPage() {
  return (
    <main className="page-shell trust-page">
      <section className="trust-hero">
        <p className="eyebrow">Terms</p>
        <h1>Terms of Use</h1>
        <p>Last updated: July 31, 2026</p>
      </section>

      <section className="trust-card">
        <h2>Use of the site</h2>
        <p>
          Job Guide Match provides job search tools and links to external application pages. You may use the site for lawful
          personal job search purposes and should not misuse, disrupt, scrape at abusive rates, or attempt to interfere with
          the service.
        </p>
      </section>

      <section className="trust-card">
        <h2>Job listings</h2>
        <p>
          Listings may be provided by third-party sources, public feeds, employers, or job-board partners. We try to present
          useful information, but we do not guarantee listing accuracy, availability, salary, hiring decisions, interview
          outcomes, or employment offers.
        </p>
      </section>

      <section className="trust-card">
        <h2>External websites</h2>
        <p>
          When you click an official apply link, you leave Job Guide Match. External sites are controlled by their own
          operators and may have separate terms, privacy policies, and application processes.
        </p>
      </section>

      <section className="trust-card">
        <h2>No professional advice</h2>
        <p>
          Information on this site is provided for general job search assistance. It is not legal, financial, immigration,
          tax, career counseling, or employment advice.
        </p>
      </section>

      <section className="trust-card">
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to{' '}
          <a className="text-link" href="mailto:contact@jobsthe.world">contact@jobsthe.world</a>.
        </p>
      </section>
    </main>
  );
}
