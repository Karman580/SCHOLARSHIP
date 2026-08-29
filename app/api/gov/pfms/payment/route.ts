// SIMULATED SERVICE. This is not a government API. No live system is contacted.
import { getRepo } from '@/lib/db/repo';
import { simulatedJson } from '@/lib/gov-mock/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('applicationId') ?? '';
  const p = await getRepo().gov.getPayment(id);
  if (!p) return simulatedJson(null);
  return simulatedJson({
    paymentId: p.paymentId,
    applicationId: p.applicationId,
    status: p.status,
    processedAt: p.processedAt,
    returnReason: p.returnReason,
    utr: p.utr,
    pendingUntilDay: p.pendingUntilDay,
  });
}
