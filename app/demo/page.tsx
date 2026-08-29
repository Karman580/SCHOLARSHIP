import { Page, SiteFooter, SyntheticNote } from '@/components/Chrome';
import { DEMO_CASE_SUMMARIES } from '@/lib/gov-mock/seed';
import { FreeTextBox, RunCaseButton } from '@/components/DemoRunner';

export const metadata = { title: 'Demo cases — Scholarship Saathi' };

export default function DemoPage() {
  return (
    <Page>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Three demo cases</h1>
      <p style={{ color: 'var(--color-ink-soft)' }}>
        Every student here is fictional and every record is synthetic. Running a case resets its records,
        so you can run it again from a clean start.
      </p>
      <SyntheticNote />

      <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
        {DEMO_CASE_SUMMARIES.map((c) => (
          <section key={c.caseNo} className="card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>Case {c.caseNo} — {c.student}</h2>
            <p style={{ marginBottom: '0.35rem' }}>{c.symptom}</p>
            <p style={{ color: 'var(--color-ink-soft)', marginTop: 0 }}>{c.expected}</p>
            <RunCaseButton caseNo={c.caseNo} />
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Judge guide ({c.minutes})</summary>
              <p style={{ color: 'var(--color-ink-soft)' }}>{c.judgeGuide}</p>
            </details>
          </section>
        ))}
      </div>

      <section className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>Try it with your own words</h2>
        <p style={{ color: 'var(--color-ink-soft)' }}>
          This is the riskiest demo, so it is the honest one. If we cannot narrow it down, we will say so
          and give you the single check that would settle it.
        </p>
        <FreeTextBox />
      </section>

      <SiteFooter />
    </Page>
  );
}
