// SIMULATED SERVICE. This is not a government API. No live system is contacted.
import { getRepo } from '@/lib/db/repo';
import { simulatedJson } from '@/lib/gov-mock/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('applicationId') ?? '';
  const a = await getRepo().gov.getApplication(id);
  if (!a) return simulatedJson(null);
  return simulatedJson({
    applicationId: a.applicationId,
    studentAlias: a.studentAlias,
    nameOnApplication: a.nameOnApplication,
    scheme: a.scheme,
    academicYear: a.academicYear,
    portalStatusText: a.portalStatusText,
    statusCode: a.sanctionedAt ? 'SANCTIONED' : a.stateVerifiedAt ? 'STATE_PENDING' : 'INSTITUTE_PENDING',
    instituteVerifiedAt: a.instituteVerifiedAt,
    stateVerifiedAt: a.stateVerifiedAt,
    sanctionedAt: a.sanctionedAt,
    amountPaise: a.amountPaise,
    bankRefId: a.bankRefId,
    aliasKey: a.aliasKey,
  });
}
