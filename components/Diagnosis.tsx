import Link from 'next/link';
import type { Band, JourneyStage, KnownItem, RankedHypothesis, UnknownItem } from '@/lib/types';
import { JourneyRail } from './JourneyRail';
import { ProvenanceBadge } from './ProvenanceBadge';

const BAND_WORD: Record<Band, string> = {
  HIGH: 'Fairly confident',
  MEDIUM: 'Possible',
  LOW: 'Not enough information yet',
};

export function ConfidenceChip({ band }: { band: Band }) {
  const color = band === 'HIGH' ? 'var(--color-confirmed)' : band === 'MEDIUM' ? 'var(--color-note)' : 'var(--color-unknown)';
  return (
    <span style={{ display: 'inline-block', border: `1px solid ${color}`, color, borderRadius: 'var(--radius-chip)', padding: '2px 8px', fontSize: '0.8125rem', fontWeight: 600 }}>
      {BAND_WORD[band]}
    </span>
  );
}

export function KnowUnknowList({ known, unknown }: { known: KnownItem[]; unknown: UnknownItem[] }) {
  return (
    <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(17rem, 1fr))' }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>What we know</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {known.map((k) => (
            <li key={k.text} data-fact-row style={{ padding: '0.35rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span>{k.text}</span>
              <ProvenanceBadge provenance={k.provenance} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>What we don&rsquo;t know</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {unknown.map((u) => (
            <li key={u.id} style={{ padding: '0.35rem 0' }}>
              <div style={{ fontWeight: 600 }}>{u.text}</div>
              <div style={{ color: 'var(--color-ink-soft)', fontSize: '0.9375rem' }}>
                How to find out: {u.howToFindOut}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function OtherPossibilities({ ranked, expandFirst }: { ranked: RankedHypothesis[]; expandFirst: boolean }) {
  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: 'var(--text-lg)' }}>Other possibilities</h2>
      {ranked.map((r, i) => (
        <details key={r.hypothesisId} open={expandFirst && i === 0} className="card" style={{ padding: '0.85rem 1rem', marginBottom: '0.6rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span>{r.label}</span>
            <span className="mono" style={{ color: 'var(--color-slate)', fontSize: '0.8125rem' }}>{Math.round(r.confidence * 100)}%</span>
          </summary>
          <p style={{ marginBottom: '0.4rem', color: 'var(--color-ink-soft)' }}>{r.why[0]}</p>
          <div style={{ fontSize: '0.9375rem' }}>
            <strong>What would prove this wrong:</strong>
            <ul style={{ paddingLeft: '1.1rem', margin: '0.25rem 0 0' }}>
              {r.disproveBy.map((d) => <li key={d}>{d}</li>)}
            </ul>
          </div>
        </details>
      ))}
    </section>
  );
}

export function DiagnosisView({
  token,
  band,
  verdictText,
  ranked,
  known,
  unknown,
  journey,
}: {
  token: string;
  band: Band;
  verdictText: string;
  ranked: RankedHypothesis[];
  known: KnownItem[];
  unknown: UnknownItem[];
  journey: JourneyStage[];
}) {
  const low = band === 'LOW';
  return (
    <>
      <section className="card" style={{ padding: '1.25rem' }} aria-live="polite">
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 0 }}>
          {low ? "We can't safely narrow this down yet" : verdictText}
        </h1>
        {low ? <p style={{ color: 'var(--color-ink-soft)' }}>{verdictText}</p> : null}
        <ConfidenceChip band={band} />
        {low && (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', marginTop: '1rem' }}>
            {ranked.slice(0, 2).map((r) => (
              <div key={r.hypothesisId} className="card" style={{ padding: '0.85rem' }}>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div className="mono" style={{ color: 'var(--color-slate)', fontSize: '0.8125rem' }}>{Math.round(r.confidence * 100)}%</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>Where it is stuck</h2>
        <JourneyRail stages={journey} animate />
      </section>

      <section className="card" style={{ padding: '1.25rem', marginTop: '1rem' }}>
        <KnowUnknowList known={known} unknown={unknown} />
      </section>

      <OtherPossibilities ranked={ranked.slice(1, 5)} expandFirst={band !== 'HIGH'} />

      <div className="no-print" style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" href={`/case/${token}/actions`}>See what to do</Link>
        <Link className="btn btn-secondary" href={`/case/${token}`}>This doesn&rsquo;t match my situation</Link>
      </div>
    </>
  );
}
