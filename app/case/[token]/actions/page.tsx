import Link from 'next/link';
import { loadCase } from '@/lib/case-page';
import { ActionList } from '@/components/ActionList';
import { ConfidenceChip } from '@/components/Diagnosis';

export const dynamic = 'force-dynamic';

export default async function ActionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cwr = await loadCase(token);

  if (!cwr.actions.length) {
    return (
      <section className="card" style={{ padding: '1.25rem' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 0 }}>No steps yet</h1>
        <p>Run the diagnosis first and we will issue the steps that follow from it.</p>
        <Link className="btn btn-primary" href={`/case/${token}/diagnosis`}>Go to the diagnosis</Link>
      </section>
    );
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--text-2xl)' }}>What to do</h1>
      {cwr.diagnosis ? (
        <p style={{ color: 'var(--color-ink-soft)' }}>
          Based on: {cwr.diagnosis.ranked[0]?.label}. <ConfidenceChip band={cwr.diagnosis.band} />
        </p>
      ) : null}
      <p style={{ color: 'var(--color-ink-soft)' }}>The order matters. Do step 1 before step 2.</p>
      <ActionList token={token} actions={cwr.actions} />
    </>
  );
}
