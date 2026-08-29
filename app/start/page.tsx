import { Suspense } from 'react';
import Link from 'next/link';
import { Page, SiteFooter, SyntheticNote } from '@/components/Chrome';
import { StartForm } from '@/components/StartForm';

export const metadata = { title: 'Start a case — Scholarship Saathi' };

export default function StartPage() {
  if (process.env.DEMO_MODE_ONLY === 'true') {
    return (
      <Page>
        <h1>This deployment runs the demo cases only</h1>
        <p>Open a seeded case instead. Every record in it is synthetic.</p>
        <Link className="btn btn-primary" href="/demo">See the demo cases</Link>
      </Page>
    );
  }
  return (
    <Page>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Start a case</h1>
      <p style={{ color: 'var(--color-ink-soft)' }}>No login. No account. Nothing is submitted anywhere.</p>
      <SyntheticNote />
      <Suspense fallback={<p>Loading the form…</p>}>
        <StartForm />
      </Suspense>
      <SiteFooter />
    </Page>
  );
}
