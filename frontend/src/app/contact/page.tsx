import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact | Job Guide Match',
  description: 'Contact Job Guide Match for support, listing questions, or privacy requests.'
};

export default function ContactPage() {
  return (
    <main className="page-shell trust-page">
      <section className="trust-hero">
        <p className="eyebrow">Contact</p>
        <h1>Contact Job Guide Match</h1>
        <p>
          For site questions, privacy requests, listing corrections, or general feedback, email us and include the page URL
          if your message is about a specific job listing.
        </p>
      </section>

      <section className="trust-card">
        <h2>Email</h2>
        <p>
          <a className="text-link" href="mailto:contact@jobsthe.world">contact@jobsthe.world</a>
        </p>
        <p>
          We aim to review messages as soon as practical. If your request is about an external application page, you may
          also need to contact the employer or job board that hosts that application.
        </p>
      </section>

      <section className="trust-card">
        <h2>Helpful links</h2>
        <p>
          Review our <Link className="text-link" href="/privacy">Privacy Policy</Link> and{' '}
          <Link className="text-link" href="/terms">Terms of Use</Link> for more information about how the site works.
        </p>
      </section>
    </main>
  );
}
