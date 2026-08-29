import { getRepo } from '@/lib/db/repo';
import { AI_ENABLED } from '@/lib/ai/client';
import { ENGINE_VERSION } from '@/lib/engine/diagnose';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const repo = getRepo();
  return ok({
    ok: true,
    aiMode: AI_ENABLED() ? 'model' : 'fallback',
    store: repo.kind,
    engineVersion: ENGINE_VERSION,
    seeded: await repo.gov.seeded(),
  });
}
