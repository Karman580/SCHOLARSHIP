'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Action } from '@/lib/types';

export function ActionList({ token, actions }: { token: string; actions: Action[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anyDone = actions.some((a) => a.completedAt);

  async function markDone(id: string) {
    setBusy(id);
    await fetch(`/api/cases/${token}/actions/${id}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    });
    setBusy(null);
    router.refresh();
  }

  async function generate(a: Action) {
    if (!a.artifactType) return;
    setGenerating(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${token}/artifacts`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: a.artifactType, actionId: a.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'Could not generate that.');
      const { artifact } = (await res.json()) as { artifact: { id: string } };
      router.push(`/case/${token}/artifact/${artifact.id}`);
    } catch (err) {
      setGenerating(null);
      setError(err instanceof Error ? err.message : 'Could not generate that.');
    }
  }

  return (
    <>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
        {actions.map((a) => (
          <li key={a.id} className="card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="mono" style={{ color: 'var(--color-slate)' }}>{a.seq}</span>
              <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>{a.title}</h2>
            </div>
            {a.body.note ? (
              <p style={{ color: 'var(--color-note)', fontWeight: 600, marginBottom: '0.5rem' }}>{a.body.note}</p>
            ) : null}
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.35rem 0.9rem', margin: '0.5rem 0' }}>
              <dt style={{ color: 'var(--color-slate)' }}>Do this</dt><dd style={{ margin: 0 }}>{a.body.doThis}</dd>
              <dt style={{ color: 'var(--color-slate)' }}>Where</dt><dd style={{ margin: 0 }}>{a.body.where}</dd>
              {a.body.takeWith.length ? (<>
                <dt style={{ color: 'var(--color-slate)' }}>Take with you</dt>
                <dd style={{ margin: 0 }}>{a.body.takeWith.join(', ')}</dd>
              </>) : null}
              <dt style={{ color: 'var(--color-slate)' }}>What to expect</dt><dd style={{ margin: 0 }}>{a.body.expect}</dd>
              <dt style={{ color: 'var(--color-slate)' }}>Typical time</dt><dd style={{ margin: 0 }}>{a.body.typicalTime}</dd>
            </dl>
            <div className="no-print" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              {a.artifactType ? (
                <button type="button" className="btn btn-secondary" disabled={generating === a.id} onClick={() => generate(a)}>
                  {generating === a.id ? 'Generating letter…' : 'Generate letter'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(a.completedAt) || busy === a.id}
                onClick={() => markDone(a.id)}
              >
                {a.completedAt ? 'Done' : busy === a.id ? 'Saving…' : 'Mark as done'}
              </button>
            </div>
          </li>
        ))}
      </ol>

      {error && <p role="alert" style={{ color: 'var(--color-blocked)', fontWeight: 600 }}>{error}</p>}

      <p style={{ color: 'var(--color-slate)', marginTop: '1rem' }}>Nothing here is submitted for you. You send it.</p>

      <div className="no-print" style={{ marginTop: '0.5rem' }}>
        {anyDone ? (
          <Link className="btn btn-primary" href={`/case/${token}/verify`}>I&rsquo;ve done these — check my case</Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled>Mark a step as done to continue</button>
        )}
      </div>
    </>
  );
}
