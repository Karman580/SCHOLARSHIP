import Link from 'next/link';
import { loadCase } from '@/lib/case-page';
import { FACT_LABELS, FACT_VALUES, isFactKey, toFactMap, type FactKey, factValueLabel } from '@/lib/engine/facts';
import { missingFacts } from '@/lib/service';
import { FactEditor, type EditableFact } from '@/components/FactEditor';

export const dynamic = 'force-dynamic';

export default async function UnderstandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cwr = await loadCase(token);
  const facts = toFactMap(cwr.facts);

  const rows: EditableFact[] = cwr.facts
    .filter((f) => isFactKey(f.key) && f.key !== 'portal_status_raw')
    .map((f) => {
      const key = f.key as FactKey;
      return {
        key,
        label: FACT_LABELS[key],
        value: f.value,
        display: factValueLabel(key, f.value),
        provenance: f.provenance,
        options: FACT_VALUES[key],
        quote: f.quote ?? null,
      };
    });

  const missing = missingFacts(facts);

  if (!rows.length) {
    return (
      <section className="card" style={{ padding: '1.25rem' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 0 }}>We don&rsquo;t have anything to work with yet</h1>
        <p>
          {cwr.evidence.length
            ? 'We could not pull any facts out of what you wrote. We can still get there by asking you a few short questions instead.'
            : 'Nothing has been added to this case yet. We can start by asking you a few short questions instead.'}
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary" href={`/case/${token}/questions`}>Continue</Link>
          <Link className="btn btn-secondary" href="/start">Start again with more detail</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card" style={{ padding: '1.25rem' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 0 }}>What we understood</h1>
        <p style={{ color: 'var(--color-ink-soft)' }}>
          Everything below carries a label saying where it came from. Anything we got wrong, correct it —
          your correction always wins over our reading.
        </p>
        <FactEditor token={token} facts={rows} />
      </section>

      {missing.length > 0 && (
        <section className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>We could not find</h2>
          <ul style={{ paddingLeft: '1.1rem', color: 'var(--color-ink-soft)', marginBottom: 0 }}>
            {missing.map((m) => <li key={m.key}>{m.label}</li>)}
          </ul>
        </section>
      )}

      <div className="no-print" style={{ marginTop: '1.25rem' }}>
        <Link className="btn btn-primary" href={`/case/${token}/questions`}>Continue</Link>
      </div>
    </>
  );
}
