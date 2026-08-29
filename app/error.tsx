'use client';
import Link from 'next/link';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.75rem' }}>Something broke on our side</h1>
      <p>Your case is saved. Nothing you entered was lost.</p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link className="btn btn-secondary" href="/">Go to the start</Link>
      </div>
    </main>
  );
}
