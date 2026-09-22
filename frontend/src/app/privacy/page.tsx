import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Job Guide Match',
  description: 'Privacy disclosures for Job Guide Match, including cookies, logs, job search data, and advertising partners.'
};

export default function PrivacyPage() {
  return (
    <main className="page-shell trust-page">
      <section className="trust-hero">
        <p className="eyebrow">Privacy Policy</p>
        <h1>Privacy Policy</h1>
        <p>Last updated: July 31, 2026</p>
      </section>

      <section className="trust-card">
        <h2>Information we collect</h2>
        <p>
          Job Guide Match may process search terms, selected matching answers, country filters, pages viewed, device and
          browser information, IP address, timestamps, referring pages, and error logs. Matching answers may be stored in
          your browser so the site can keep your selected filters while you move between pages.
        </p>
      </section>

      <section className="trust-card">
        <h2>How we use information</h2>
        <p>
          We use information to operate the site, return relevant job results, maintain security, diagnose technical issues,
          understand site performance, improve the user experience, and respond to messages or privacy requests.
        </p>
      </section>

      <section className="trust-card">
        <h2>Cookies, local storage, and advertising</h2>
        <p>
          The site may use browser storage, cookies, web beacons, IP addresses, or similar identifiers for functionality,
          analytics, security, advertising, ad measurement, and fraud prevention. Third parties, including Google and other
          advertising partners, may place or read cookies in your browser or use web beacons and IP addresses when ads are
          served on this site.
        </p>
        <p>
          Learn more about{' '}
          <a className="text-link" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">
            how Google uses data when you use partner sites or apps
          </a>.
        </p>
      </section>

      <section className="trust-card">
        <h2>External job links</h2>
        <p>
          Job Guide Match links to third-party websites where users may apply for jobs. Those sites have their own privacy
          practices. Review their policies before submitting personal information or application materials.
        </p>
      </section>

      <section className="trust-card">
        <h2>Your choices</h2>
        <p>
          You can clear cookies and local storage through your browser settings. You can also use browser or device controls
          to limit certain advertising or analytics identifiers. Some features may not work as expected if browser storage is
          disabled.
        </p>
      </section>

      <section className="trust-card">
        <h2>Children</h2>
        <p>
          Job Guide Match is not directed to children under 13. If you believe a child has provided personal information
          through this site, contact us so we can review the request.
        </p>
      </section>

      <section className="trust-card">
        <h2>Contact</h2>
        <p>
          For privacy questions or requests, email{' '}
          <a className="text-link" href="mailto:contact@jobsthe.world">contact@jobsthe.world</a>.
        </p>
      </section>
    </main>
  );
}
