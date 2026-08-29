'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProvenanceBadge } from './ProvenanceBadge';

export type ClientQuestion = {
  id: string;
  prompt: string;
  why: string;
  options: { id: string; label: string }[];
  howToCheck?: { steps: string[]; provenance: 'PUBLIC_RULE' };
};

export function QuestionFlow({
  token,
  question,
  askedCount,
}: {
  token: string;
  question: ClientQuestion;
  askedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The answer buttons stay disabled until the next question actually arrives, then
  // become live again. Without this the student is stuck on question two.
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [question.id]);

  async function answer(value: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cases/${token}/answers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, answer: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'That did not go through.');
      const body = (await res.json()) as { nextQuestion: unknown };
      if (body.nextQuestion) router.refresh();
      else router.push(`/case/${token}/diagnosis`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'That did not go through.');
    }
  }

  return (
    <section className="card" style={{ padding: '1.25rem' }}>
      <p style={{ color: 'var(--color-slate)', fontSize: '0.875rem', margin: 0 }}>
        Question {askedCount + 1} — usually 3 to 5 in total
      </p>
      <h1 style={{ fontSize: 'var(--text-xl)', marginTop: '0.35rem' }}>{question.prompt}</h1>

      <div style={{ display: 'grid', gap: '0.6rem', margin: '1rem 0' }}>
        {question.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="btn btn-secondary"
            data-answer
            style={{ minHeight: 56, width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
            disabled={busy}
            onClick={() => answer(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button type="button" disabled={busy} onClick={() => answer('DONT_KNOW')}
          style={{ background: 'none', border: 'none', font: 'inherit', color: 'var(--color-note)', cursor: 'pointer', minHeight: 44, padding: '0.5rem 0.75rem 0.5rem 0' }}>
          I don&rsquo;t know
        </button>
        <button type="button" disabled={busy} onClick={() => answer('SKIPPED')}
          style={{ background: 'none', border: 'none', font: 'inherit', color: 'var(--color-note)', cursor: 'pointer', minHeight: 44, padding: '0.5rem 0.75rem 0.5rem 0' }}>
          Skip
        </button>
      </div>

      {error && <p role="alert" style={{ color: 'var(--color-blocked)', fontWeight: 600 }}>{error}</p>}

      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Why we&rsquo;re asking</summary>
        <p style={{ color: 'var(--color-ink-soft)' }}>{question.why}</p>
      </details>

      {question.howToCheck && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            How to check this <ProvenanceBadge provenance={question.howToCheck.provenance} />
          </summary>
          <ol style={{ paddingLeft: '1.2rem', color: 'var(--color-ink-soft)' }}>
            {question.howToCheck.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </details>
      )}
    </section>
  );
}
