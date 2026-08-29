import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.75rem' }}>We cannot find this page</h1>
      <p>The link may be wrong, or the demo data was reset.</p>
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" href="/start">Start a new case</Link>
        <Link className="btn btn-secondary" href="/demo">See a demo case</Link>
      </div>
    </main>
  );
}
