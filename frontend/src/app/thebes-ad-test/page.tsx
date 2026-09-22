import type { Metadata } from 'next';
import { AdPlaceholder } from '../../components/AdPlaceholder';

export const metadata: Metadata = {
  title: 'Thebes Pilot Ad Test | Job Guide Match',
  robots: {
    index: false,
    follow: false
  }
};

export default function ThebesAdTestPage() {
  return (
    <main className="page-shell thebes-test-page">
      <section className="thebes-test-hero">
        <p className="eyebrow">Thebes pilot</p>
        <h1>Ad integration test</h1>
        <p>
          This page requests pilot ads for Job Guide Match using publisher-controlled containers and measured runtime
          sizes. It is intentionally not linked from site navigation.
        </p>
      </section>

      <section className="thebes-test-grid" aria-label="Thebes native test slots">
        <div>
          <h2>Native 336 x 280</h2>
          <AdPlaceholder placement="native" />
        </div>
        <div>
          <h2>Rectangle 300 x 250</h2>
          <AdPlaceholder placement="rectangle" />
        </div>
      </section>
    </main>
  );
}
