'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunCaseButton({ caseNo }: { caseNo: 1 | 2 | 3 }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch('/api/demo/seed', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseNo }),
          });
          if (!res.ok) { setBusy(false); setError('Could not start that case. Try again.'); return; }
          const { token } = (await res.json()) as { token: string };
          router.push(`/case/${token}`);
        }}
      >
        {busy ? 'Setting up…' : 'Run this case'}
      </button>
      {error && <p role="alert" style={{ color: 'var(--color-blocked)' }}>{error}</p>}
    </>
  );
}

export function FreeTextBox() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <textarea
        className="field"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Describe a situation in your own words"
        placeholder="Type any situation in your own words — something we did not write."
        style={{ resize: 'vertical' }}
      />
      <button
        type="button"
        className="btn btn-primary"
        style={{ marginTop: '0.6rem' }}
        disabled={busy || text.trim().length < 15}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const created = await fetch('/api/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
            if (!created.ok) throw new Error('Could not start a case.');
            const { token } = (await created.json()) as { token: string };
            const form = new FormData();
            form.set('description', text);
            const intake = await fetch(`/api/cases/${token}/intake`, { method: 'POST', body: form });
            if (!intake.ok) throw new Error('Could not read that.');
            router.push(`/case/${token}`);
          } catch (err) {
            setBusy(false);
            setError(err instanceof Error ? err.message : 'Could not read that.');
          }
        }}
      >
        {busy ? 'Reading…' : 'Try it with my words'}
      </button>
      {error && <p role="alert" style={{ color: 'var(--color-blocked)' }}>{error}</p>}
    </div>
  );
}
