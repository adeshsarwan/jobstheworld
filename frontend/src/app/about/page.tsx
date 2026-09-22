import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | Job Guide Match',
  description: 'Learn how Job Guide Match helps job seekers narrow practical work options.'
};

export default function AboutPage() {
  return (
    <main className="page-shell trust-page">
      <section className="trust-hero">
        <p className="eyebrow">About</p>
        <h1>Practical job search guidance for everyday work.</h1>
        <p>
          Job Guide Match is a guided job search experience for people who want a simpler way to explore work by role type,
          location preference, schedule, and experience level. The goal is to reduce the noise around job hunting and help
          visitors get to relevant listings faster.
        </p>
      </section>

      <section className="trust-card">
        <h2>How it works</h2>
        <p>
          Visitors can search directly, answer a short matching flow, or use the guided chat. The site turns those choices
          into filters and shows job listings that may fit the selected preferences.
        </p>
        <p>
          Job details are provided to help users compare roles before leaving Job Guide Match for the official employer or
          job-board application page.
        </p>
      </section>

      <section className="trust-card">
        <h2>Job data and external links</h2>
        <p>
          Job listings may come from third-party sources, public job feeds, employer pages, or job-board partners. We do not
          represent employers, make hiring decisions, or guarantee that a listing is still available when a user clicks out
          to apply.
        </p>
      </section>

      <section className="trust-card">
        <h2>Job seeker safety</h2>
        <p>
          Users should review the employer page carefully before sharing personal information. Be cautious with requests for
          payment, unusual banking details, or interviews that avoid verifiable company channels.
        </p>
      </section>
    </main>
  );
}
