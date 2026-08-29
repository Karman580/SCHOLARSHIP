import Link from 'next/link';
import { loadCase } from '@/lib/case-page';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { CaseSummaryButton } from '@/components/CaseSummaryButton';
import type { Provenance } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ACTOR_LABEL: Record<string, string> = { USER: 'You', SAATHI: 'Saathi', DEMO_GOV: 'Demo government system' };
const ACTOR_PROVENANCE: Record<string, Provenance> = { USER: 'USER_STATED', SAATHI: 'AI_INFERENCE', DEMO_GOV: 'SIMULATED' };

export default async function TimelinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cwr = await loadCase(token);
  const events = [...cwr.events].reverse();

  return (
    <>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>Case history</h1>
      <p style={{ color: 'var(--color-ink-soft)' }}>
        Current state: <strong>{cwr.case.state.toLowerCase().replace(/_/g, ' ')}</strong>
        {cwr.escalations.length ? ` · escalated ${cwr.escalations.length} time${cwr.escalations.length === 1 ? '' : 's'}` : ''}
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {events.map((e) => (
          <li key={e.id} className="card" data-fact-row style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--color-slate)' }}>
              {new Date(e.createdAt).toLocaleString('en-IN')}
            </span>
            <span style={{ fontWeight: 600 }}>{ACTOR_LABEL[e.actor] ?? e.actor}</span>
            <span>{e.summary}</span>
            <ProvenanceBadge provenance={ACTOR_PROVENANCE[e.actor] ?? 'AI_INFERENCE'} />
          </li>
        ))}
      </ol>

      <div className="no-print" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
        <CaseSummaryButton token={token} />
        <Link className="btn btn-secondary" href={`/case/${token}/diagnosis`}>Back to the diagnosis</Link>
      </div>
    </>
  );
}
