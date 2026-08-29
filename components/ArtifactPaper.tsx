'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Artifact } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  BANK_DBT_REQUEST: 'Request to your bank',
  BANK_REACTIVATION_REQUEST: 'Account reactivation request',
  INSTITUTE_FOLLOWUP: 'Follow-up to your college',
  PORTAL_GRIEVANCE: 'Portal grievance text',
  RTI_DRAFT: 'RTI request draft',
  CASE_SUMMARY: 'Case summary',
};

function Highlighted({ body }: { body: string }) {
  const parts = body.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[\[.+\]\]$/.test(p) ? (
          <mark key={i} style={{ background: '#FCF0DA', color: '#5C3B08', padding: '0 2px', borderRadius: 3 }}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ArtifactPaper({ token, artifact }: { token: string; artifact: Artifact }) {
  const router = useRouter();
  const [body, setBody] = useState(artifact.body);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState(artifact.language);
  const placeholders = body.match(/\[\[[^\]]+\]\]/g) ?? [];

  async function save() {
    setBusy(true);
    await fetch(`/api/cases/${token}/artifacts/${artifact.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }),
    });
    setBusy(false);
    setEditing(false);
    router.refresh();
  }

  async function switchLanguage() {
    const next = lang === 'en' ? 'hi' : 'en';
    setBusy(true);
    const res = await fetch(`/api/cases/${token}/artifacts`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: artifact.type, language: next }),
    });
    setBusy(false);
    if (!res.ok) return;
    const { artifact: a } = (await res.json()) as { artifact: Artifact };
    setLang(next);
    router.push(`/case/${token}/artifact/${a.id}`);
  }

  function download() {
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.type.toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', margin: 0 }}>{TYPE_LABEL[artifact.type] ?? artifact.type}</h1>
        <span style={{ color: 'var(--color-slate)' }}>To: {artifact.recipient}</span>
      </div>
      <p className="no-print" style={{ fontWeight: 600, color: 'var(--color-ink-soft)' }}>Draft for you to send. Not submitted.</p>

      {placeholders.length > 0 && (
        <p className="no-print" role="status" style={{ color: 'var(--color-unknown)', fontWeight: 600 }}>
          {placeholders.length} thing{placeholders.length === 1 ? '' : 's'} still to fill in. You can still download it.
        </p>
      )}

      <div className="card" style={{ padding: '2rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {editing ? (
          <textarea
            className="field"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={Math.min(40, body.split('\n').length + 4)}
            aria-label="Edit the draft"
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        ) : (
          <Highlighted body={body} />
        )}
      </div>

      <div className="no-print" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
        }}>{copied ? 'Text copied' : 'Copy text'}</button>
        <button type="button" className="btn btn-secondary" onClick={download}>Download .txt</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print / save as PDF</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={switchLanguage}>
          {lang === 'en' ? 'हिंदी में देखें' : 'Switch to English'}
        </button>
        {editing ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save my edits'}</button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
    </>
  );
}
