'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Action, JourneyStage } from '@/lib/types';
import { JourneyRail } from './JourneyRail';
import { ProvenanceBadge } from './ProvenanceBadge';

type VerifyResponse = {
  result: 'RESOLVED' | 'PROGRESSED' | 'NO_CHANGE' | 'NEEDS_MORE_INFO';
  journey: JourneyStage[];
  simulatedAdvance: number;
  creditSimulated?: { amountPaise: number; dateIso: string | null; accountMasked: string | null; utr: string | null };
  escalation?: { currentRung: string | null; nextRung: string | null; artifactType: string | null };
};

const RESULT_HEADLINE: Record<VerifyResponse['result'], string> = {
  RESOLVED: 'The demo records now show the credit',
  PROGRESSED: 'Something moved',
  NO_CHANGE: 'Nothing moved yet',
  NEEDS_MORE_INFO: 'We need one more thing from you',
};

export function VerifyFlow({ token, actions, ladder }: {
  token: string;
  actions: Action[];
  ladder: { id: string; label: string; canDo: string; publicRuleNote: string }[];
}) {
  const router = useRouter();
  const completed = actions.filter((a) => a.completedAt);
  const candidates = completed.length ? completed : actions;
  const [actionId, setActionId] = useState(candidates[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<VerifyResponse | null>(null);

  const action = actions.find((a) => a.id === actionId);

  async function submit(outcome: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/cases/${token}/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, outcome }),
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? 'That did not go through.');
      setRes((await r.json()) as VerifyResponse);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    setBusy(true);
    const r = await fetch(`/api/cases/${token}/escalate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    setBusy(false);
    if (!r.ok) { setError('You are already at the last step of the ladder we can help with.'); return; }
    const { artifact } = (await r.json()) as { artifact: { id: string } };
    router.push(`/case/${token}/artifact/${artifact.id}`);
  }

  if (res) {
    return (
      <section aria-live="polite">
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>{RESULT_HEADLINE[res.result]}</h1>
        {res.simulatedAdvance > 0 && (
          <p style={{ color: 'var(--color-unknown)', fontWeight: 600 }}>
            Demo time moved forward {res.simulatedAdvance} days to show what happens after a few days.
          </p>
        )}

        {res.creditSimulated && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div data-fact-row style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
                ₹{(res.creditSimulated.amountPaise / 100).toLocaleString('en-IN')}
              </span>
              <span className="mono">{res.creditSimulated.dateIso ?? 'date not recorded'}</span>
              <span className="mono">account ending {(res.creditSimulated.accountMasked ?? 'XXXX').slice(-4)}</span>
              <ProvenanceBadge provenance="SIMULATED" />
            </div>
            <p style={{ color: 'var(--color-slate)', margin: '0.5rem 0 0' }}>
              This is a simulated credit in our demo records. No real payment happened.
            </p>
          </div>
        )}

        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <JourneyRail stages={res.journey} />
        </div>

        {res.result === 'RESOLVED' && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>What to do if it does not actually arrive in 7 days</h2>
            <p style={{ marginBottom: 0 }}>
              Go back to your branch with the dated acknowledgement, and tell your college nodal officer in
              writing that the account is now able to receive the payment. Then come back here and record
              what happened — the case stays open for you.
            </p>
          </div>
        )}

        {res.result === 'NO_CHANGE' && (
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginTop: 0 }}>Take it up a level</h2>
            <ol style={{ paddingLeft: '1.2rem' }}>
              {ladder.map((r) => (
                <li key={r.id} style={{ marginBottom: '0.5rem', fontWeight: r.id === res.escalation?.nextRung ? 600 : 400 }}>
                  {r.label} — {r.canDo}
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-slate)' }}>
                    {r.publicRuleNote} <ProvenanceBadge provenance="PUBLIC_RULE" />
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={escalate}>
              Escalate and write the next letter
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link className="btn btn-secondary" href={`/case/${token}/timeline`}>See the case history</Link>
          {res.result !== 'RESOLVED' && (
            <button type="button" className="btn btn-secondary" onClick={() => setRes(null)}>Record something else</button>
          )}
          {res.result === 'NEEDS_MORE_INFO' && (
            <Link className="btn btn-primary" href={`/case/${token}/questions`}>Answer the new question</Link>
          )}
          {res.result === 'PROGRESSED' && (
            <Link className="btn btn-primary" href={`/case/${token}/actions`}>See the next steps</Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>What happened when you did it?</h1>
      <p style={{ color: 'var(--color-ink-soft)' }}>
        In a real deployment this check would call the scholarship and payment systems. Here it reads our
        synthetic records. <ProvenanceBadge provenance="SIMULATED" />
      </p>

      {candidates.length > 1 && (
        <label style={{ display: 'block', margin: '1rem 0' }}>
          <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Which step?</span>
          <select className="field" value={actionId} onChange={(e) => setActionId(e.target.value)}>
            {candidates.map((a) => <option key={a.id} value={a.id}>{a.seq}. {a.title}</option>)}
          </select>
        </label>
      )}

      <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem' }}>
        {(action?.body.outcomes ?? []).map((o) => (
          <button key={o.id} type="button" className="btn btn-secondary" disabled={busy}
            style={{ minHeight: 56, justifyContent: 'flex-start', textAlign: 'left' }}
            onClick={() => submit(o.id)}>
            {o.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" style={{ color: 'var(--color-blocked)', fontWeight: 600 }}>{error}</p>}
    </section>
  );
}
