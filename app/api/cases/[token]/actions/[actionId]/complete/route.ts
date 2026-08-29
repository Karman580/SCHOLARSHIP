import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { transition } from '@/lib/engine/machine';
import { envelope } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ outcome: z.string().max(60).optional() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ token: string; actionId: string }> }) {
  const limited = guardRate(req);
  if (limited) return limited;
  const { token, actionId } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const action = cwr.actions.find((a) => a.id === actionId);
    if (!action) return fail('CASE_NOT_FOUND', 'We cannot find that step.');

    await repo.completeAction(cwr.case.id, actionId, parsed.data.outcome);
    await repo.addEvent(cwr.case.id, { type: 'ACTION_COMPLETED', actor: 'USER', summary: `Marked done: ${action.title}` });

    if (cwr.case.state === 'ACTION_PLANNED' || cwr.case.state === 'AWAITING_VERIFICATION') {
      await repo.setCaseState(cwr.case.id, transition(cwr.case.state, 'ACTION_COMPLETED').nextState);
    }
    const final = (await repo.getCaseByToken(token))!;
    return ok(envelope(final));
  } catch (err) {
    return serverError('POST complete action', err);
  }
}
