import { getRepo } from '@/lib/db/repo';
import { nextQuestion } from '@/lib/service';
import { fail, ok, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const nq = await nextQuestion(repo, cwr.case);
    return ok({ nextQuestion: nq.question, askedCount: nq.askedCount, expectedRemaining: nq.expectedRemaining });
  } catch (err) {
    return serverError('GET /api/cases/[token]/questions', err);
  }
}
