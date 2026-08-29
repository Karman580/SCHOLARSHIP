import { getRepo } from '@/lib/db/repo';
import { envelope } from '@/lib/service';
import { fail, ok, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const cwr = await getRepo().getCaseByToken(token);
    // Never leak whether a token ever existed.
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    return ok(envelope(cwr));
  } catch (err) {
    return serverError('GET /api/cases/[token]', err);
  }
}
