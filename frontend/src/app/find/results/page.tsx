import { Suspense } from 'react';
import { ResultsClient } from '../../../components/ResultsClient';

export default function ResultsPage() {
  return (
    <Suspense fallback={<main className="page-shell"><div className="empty-state">Loading jobs...</div></main>}>
      <ResultsClient />
    </Suspense>
  );
}
