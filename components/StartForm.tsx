'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const AADHAAR = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
const ACCOUNT = /\b\d{9,18}\b/g;
const OTP = /\b(otp|o\.t\.p\.?)\b([^0-9\n]{0,16})\d{4,6}\b/gi;

/** Mirrors lib/redact.ts. The server repeats every one of these on the write path. */
function clientRedact(s: string): { text: string; removed: boolean } {
  let removed = false;
  const mark = () => { removed = true; return '[removed]'; };
  let out = s.replace(OTP, (_m, w, gap) => { removed = true; return `${w}${gap}[removed]`; });
  out = out.replace(AADHAAR, mark);
  out = out.replace(ACCOUNT, (m) => (m.length === 10 ? m : mark()));
  return { text: out, removed };
}

const YEARS = (() => {
  const y = new Date().getFullYear();
  return [0, 1, 2].map((i) => `${y - i}-${String((y - i + 1) % 100).padStart(2, '0')}`);
})();

export function StartForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get('prefill') ?? '';

  const [description, setDescription] = useState(prefill);
  const [statusText, setStatusText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [schemeType, setSchemeType] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [portal, setPortal] = useState('');
  const [consent, setConsent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [caseToken, setCaseToken] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => consent && !busy && (description.trim().length >= 15 || statusText.trim().length > 0 || files.length > 0),
    [consent, busy, description, statusText, files],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const d = clientRedact(description);
    const s = clientRedact(statusText);
    if (d.removed || s.removed) setToast('We removed a number that looked like an Aadhaar or account number.');

    try {
      const created = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!created.ok) throw new Error((await created.json()).error?.message ?? 'Could not start a case.');
      const { token } = (await created.json()) as { token: string };

      const form = new FormData();
      form.set('description', d.text);
      form.set('statusText', s.text);
      if (schemeType) form.set('schemeType', schemeType);
      if (academicYear) form.set('academicYear', academicYear);
      if (portal) form.set('portal', portal);
      for (const f of files) form.append('files', f);

      const intake = await fetch(`/api/cases/${token}/intake`, { method: 'POST', body: form });
      const body = await intake.json().catch(() => null);
      if (!intake.ok) {
        throw new Error(body?.error?.message ?? 'We could not read that. Try pasting the status as text.');
      }

      // The API tells us which images it could not read. Saying nothing would leave the
      // student thinking their screenshot was understood.
      // ponytail: pressing the button again starts a fresh case rather than adding to this
      // one — re-intake is not a state the machine allows. Worth building only if students
      // actually arrive here with a case worth keeping.
      const unreadable: string[] = body?.unreadableFiles ?? [];
      if (unreadable.length) {
        setBusy(false);
        setCaseToken(token);
        setUnreadable(unreadable);
        return;
      }
      router.push(`/case/${token}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Something broke on our side.');
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>Tell us what&rsquo;s happening</h2>
        <label htmlFor="description" style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem' }}>
          In your own words
        </label>
        <textarea
          id="description"
          className="field"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-describedby="description-help"
          placeholder="e.g. My post-matric scholarship shows sanctioned since December but nothing has come to my account. My college says it's done from their side."
          style={{ resize: 'vertical' }}
        />
        <p id="description-help" style={{ fontSize: '0.875rem', color: 'var(--color-slate)' }}>
          Hindi, Hinglish or English are all fine. At least 15 characters, unless you paste a status or add a screenshot.
        </p>

        <label htmlFor="statusText" style={{ display: 'block', fontWeight: 600, margin: '1rem 0 0.35rem' }}>
          Paste exactly what the portal shows (optional)
        </label>
        <textarea id="statusText" className="field" rows={3} value={statusText} onChange={(e) => setStatusText(e.target.value)} style={{ resize: 'vertical' }} />

        <label htmlFor="files" style={{ display: 'block', fontWeight: 600, margin: '1rem 0 0.35rem' }}>
          Upload a screenshot (optional)
        </label>
        <input
          id="files"
          className="field"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
          aria-describedby="files-help"
        />
        <p id="files-help" style={{ fontSize: '0.875rem', color: 'var(--color-slate)' }}>
          We read the text in the image and then discard the image. We never store your screenshot. Up to 3 files, 5 MB each.
        </p>
        {files.length > 0 && (
          <ul style={{ fontSize: '0.875rem', color: 'var(--color-ink-soft)' }}>
            {files.map((f) => <li key={f.name}>{f.name}</li>)}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>A few basics</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-slate)', marginTop: 0 }}>All optional. Skip anything you are unsure about.</p>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
          <label style={{ display: 'block' }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Scholarship type</span>
            <select className="field" value={schemeType} onChange={(e) => setSchemeType(e.target.value)}>
              <option value="">Not sure</option>
              <option value="PRE_MATRIC">Pre-Matric</option>
              <option value="POST_MATRIC">Post-Matric</option>
              <option value="MERIT_CUM_MEANS">Merit-cum-Means</option>
              <option value="TOP_CLASS">Top Class</option>
              <option value="STATE_SCHEME">State scheme</option>
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Academic year</span>
            <select className="field" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
              <option value="">Not sure</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Portal</span>
            <select className="field" value={portal} onChange={(e) => setPortal(e.target.value)}>
              <option value="">Not sure</option>
              <option value="NATIONAL">National portal</option>
              <option value="STATE">My state&rsquo;s portal</option>
            </select>
          </label>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
          <span>I understand this is a demo prototype using synthetic data.</span>
        </label>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-slate)' }}>
          Do not enter your Aadhaar number, full bank account number, or any OTP. We will remove them if you do.
        </p>
      </section>

      {unreadable.length > 0 && (
        <div className="card" role="alert" style={{ padding: '1rem', borderColor: 'var(--color-unknown)', marginBottom: '1rem' }}>
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            We could not read {unreadable.length === 1 ? 'this screenshot' : 'these screenshots'}: {unreadable.join(', ')}.
          </p>
          <p style={{ marginBottom: '0.75rem' }}>
            Type or paste what it shows into &ldquo;Paste exactly what the portal shows&rdquo; above — that works
            just as well. Or carry on without it.
          </p>
          <a className="btn btn-secondary" href={`/case/${caseToken}`}>Continue to my case anyway</a>
        </div>
      )}

      {toast && <p role="status" style={{ color: 'var(--color-unknown)', fontWeight: 600 }}>{toast}</p>}
      {error && <p role="alert" style={{ color: 'var(--color-blocked)', fontWeight: 600 }}>{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={!canSubmit} style={{ width: '100%', maxWidth: '20rem' }}>
        {busy ? 'Reading what you wrote…' : 'Start my case'}
      </button>
    </form>
  );
}
