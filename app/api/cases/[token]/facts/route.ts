import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { redact } from '@/lib/redact';
import { FACT_KEYS, FACT_LABELS, factValueLabel, isFactKey, normaliseFactValue } from '@/lib/engine/facts';
import { transition } from '@/lib/engine/machine';
import { QUESTION_BY_ID } from '@/lib/engine/questions';
import { envelope, nextQuestion } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ key: z.enum(FACT_KEYS), value: z.string().nullable() }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req);
  if (limited) return limited;
  const { token } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const c = cwr.case;
    if (!isFactKey(parsed.data.key)) return fail('VALIDATION_ERROR', 'Unknown fact.');

    const raw = redact(parsed.data.value ?? 'UNKNOWN');
    const value = normaliseFactValue(parsed.data.key, raw) ?? 'UNKNOWN';
    await repo.upsertFacts(c.id, [{ key: parsed.data.key, value, provenance: 'USER_STATED' }]);
    await repo.addEvent(c.id, {
      type: 'FACT_EDITED',
      actor: 'USER',
      summary: `You corrected ${FACT_LABELS[parsed.data.key].toLowerCase()} to ${factValueLabel(parsed.data.key, value)}.`,
      payload: { key: parsed.data.key, value },
    });

    // Any answer given after the question this fact resolves is now unreliable.
    const asked = cwr.questions;
    const affected = asked.find((q) => QUESTION_BY_ID.get(q.questionId)?.resolves.includes(parsed.data.key));
    if (affected) await repo.invalidateAnswersAfter(c.id, affected.seq);

    if (c.state !== 'NEW' && c.state !== 'INTAKE') {
      await repo.setCaseState(c.id, transition(c.state, 'FACT_EDITED').nextState);
    }
    const fresh = (await repo.getCaseByToken(token))!;
    const nq = await nextQuestion(repo, fresh.case);
    const final = (await repo.getCaseByToken(token))!;
    return ok(envelope(final, { nextQuestion: nq.question }));
  } catch (err) {
    return serverError('PATCH /api/cases/[token]/facts', err);
  }
}
