import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  language: z.enum(['en', 'hi']).optional(),
  isDemo: z.boolean().optional(),
  demoCaseNo: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
}).strict();

export async function POST(req: Request) {
  const limited = guardRate(req);
  if (limited) return limited;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  if (process.env.DEMO_MODE_ONLY === 'true' && !parsed.data.isDemo) {
    return fail('INVALID_STATE', 'This deployment only runs the seeded demo cases.');
  }

  try {
    const repo = getRepo();
    // Lazy retention sweep: 7-day retention, no cron.
    if (Math.random() < 0.05) await repo.sweepExpiredCases();
    const c = await repo.createCase(parsed.data);
    await repo.addEvent(c.id, { type: 'CASE_CREATED', actor: 'USER', summary: 'Case created.' });
    return ok({ token: c.token, state: c.state }, 201);
  } catch (err) {
    return serverError('POST /api/cases', err);
  }
}
