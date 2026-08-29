import Link from 'next/link';
import { loadCase } from '@/lib/case-page';
import { nextEscalationRung } from '@/lib/service';
import { VerifyFlow } from '@/components/VerifyFlow';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cwr = await loadCase(token);
  if (!cwr.actions.length) {
    return (
      <section className="card" style={{ padding: '1.25rem' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', marginTop: 0 }}>Nothing to check yet</h1>
        <p>Once you have a step to do, come back and tell us what happened.</p>
        <Link className="btn btn-primary" href={`/case/${token}/diagnosis`}>Go to the diagnosis</Link>
      </section>
    );
  }
  const { ladder } = nextEscalationRung(cwr);
  return (
    <VerifyFlow
      token={token}
      actions={cwr.actions}
      ladder={ladder.map((r) => ({ id: r.id, label: r.label, canDo: r.canDo, publicRuleNote: r.publicRuleNote }))}
    />
  );
}
