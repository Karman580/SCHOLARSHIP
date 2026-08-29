import { getRepo } from '@/lib/db/repo';
import { canTransition, transition } from '@/lib/engine/machine';
import { diagnosisView, envelope, runDiagnosis } from '@/lib/service';
import { fail, guardRate, ok, serverError } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req, 'model');
  if (limited) return limited;
  const { token } = await ctx.params;
  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');

    // Idempotent: re-runs the engine on current facts and stores a fresh row.
    if (canTransition(cwr.case.state, 'NO_QUESTION')) {
      await repo.setCaseState(cwr.case.id, transition(cwr.case.state, 'NO_QUESTION').nextState);
    }
    const { diagnosis, actions } = await runDiagnosis(repo, cwr.case);
    if (canTransition('DIAGNOSED', 'ACTIONS_ISSUED') && cwr.case.state !== 'RESOLVED') {
      const state = (await repo.getCaseByToken(token))!.case.state;
      if (state === 'DIAGNOSED') await repo.setCaseState(cwr.case.id, 'ACTION_PLANNED');
    }
    const final = (await repo.getCaseByToken(token))!;
    return ok({ diagnosis: diagnosisView(diagnosis), actions, case: envelope(final).case });
  } catch (err) {
    return serverError('POST /api/cases/[token]/diagnose', err);
  }
}
