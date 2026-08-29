'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProvenanceBadge } from './ProvenanceBadge';
import type { Provenance } from '@/lib/types';

export type EditableFact = {
  key: string;
  label: string;
  value: string;
  display: string;
  provenance: Provenance;
  options: readonly string[] | null;
  quote: string | null;
};

export function FactEditor({ token, facts }: { token: string; facts: EditableFact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(key: string, value: string) {
    setBusy(true);
    await fetch(`/api/cases/${token}/facts`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    setEditing(null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      {facts.map((f) => (
        <div key={f.key} data-fact-row style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', padding: '0.45rem 0', borderBottom: '1px solid var(--color-line)' }}>
          <span style={{ color: 'var(--color-slate)', fontSize: '0.875rem', flex: '0 0 11rem' }}>{f.label}</span>
          {editing === f.key && f.options ? (
            <>
              <select
                className="field"
                style={{ flex: '1 1 12rem' }}
                defaultValue={f.value}
                disabled={busy}
                onChange={(e) => save(f.key, e.target.value)}
                aria-label={`Correct ${f.label}`}
              >
                {f.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ').toLowerCase()}</option>)}
              </select>
              {/* Without this, picking the value it already has leaves the row stuck open. */}
              <button
                type="button"
                className="btn btn-secondary no-print"
                style={{ minHeight: 32, padding: '0 0.6rem', fontSize: '0.8125rem' }}
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>{f.display}</span>
              <ProvenanceBadge provenance={f.provenance} />
              {f.options ? (
                <button
                  type="button"
                  className="btn btn-secondary no-print"
                  style={{ minHeight: 32, padding: '0 0.6rem', fontSize: '0.8125rem' }}
                  onClick={() => setEditing(f.key)}
                >
                  Correct this
                </button>
              ) : null}
            </>
          )}
          {f.quote ? (
            <span style={{ width: '100%', color: 'var(--color-slate)', fontSize: '0.8125rem' }}>From your words: &ldquo;{f.quote}&rdquo;</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
