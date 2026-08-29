// SIMULATED SERVICE. This is not a government API. No live system is contacted.
import { getRepo } from '@/lib/db/repo';
import { simulatedJson } from '@/lib/gov-mock/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get('bankRefId') ?? '';
  const a = await getRepo().gov.getAccount(ref);
  if (!a) return simulatedJson(null);
  return simulatedJson({
    bankRefId: a.bankRefId, bankName: a.bankName, accountMasked: a.accountMasked,
    accountStatus: a.accountStatus, nameOnAccount: a.nameOnAccount,
    aadhaarSeeded: a.aadhaarSeeded, dbtEnabled: a.dbtEnabled,
  });
}
