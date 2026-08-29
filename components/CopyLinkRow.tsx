'use client';
import { useState } from 'react';

export function CopyLinkRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card no-print" style={{ padding: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
        <div className="mono" style={{ fontSize: '0.8125rem', overflowWrap: 'anywhere', color: 'var(--color-ink-soft)' }}>{url}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-slate)' }}>
          There is no login. This link is your case. Anyone with it can see this case, so do not share it.
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Link copied' : 'Save this link'}
      </button>
    </div>
  );
}
