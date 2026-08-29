'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CaseSummaryButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/cases/${token}/artifacts`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'CASE_SUMMARY' }),
        });
        setBusy(false);
        if (!res.ok) return;
        const { artifact } = (await res.json()) as { artifact: { id: string } };
        router.push(`/case/${token}/artifact/${artifact.id}`);
      }}
    >
      {busy ? 'Preparing…' : 'Download case summary'}
    </button>
  );
}
