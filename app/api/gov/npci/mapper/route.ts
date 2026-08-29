// SIMULATED SERVICE. This is not a government API. No live system is contacted.
// There is no Aadhaar number anywhere in this codebase. aliasKey is a synthetic id.
import { getRepo } from '@/lib/db/repo';
import { simulatedJson } from '@/lib/gov-mock/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('aliasKey') ?? '';
  const m = await getRepo().gov.getMapping(key);
  if (!m) return simulatedJson(null);
  return simulatedJson({ mappingId: m.mappingId, aliasKey: m.aliasKey, mappedBank: m.mappedBank, dbtEnabled: m.dbtEnabled, lastUpdated: m.lastUpdated });
}
