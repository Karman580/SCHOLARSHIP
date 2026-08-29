import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { mergeFacts } from '@/lib/engine/facts';
import { factsFromAnswer, isValidAnswer, QUESTION_BY_ID } from '@/lib/engine/questions';
import { transition } from '@/lib/engine/machine';
import { envelope, nextQuestion, runDiagnosis } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';
import type { FactInput } from '@/lib/types';

export const runtime = 'nodejs';

const Body = z.object({ questionId: z.string().min(1), answer: z.string().min(1) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req);
  if (limited) return limited;
  const { token } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;
  const { questionId, answer } = parsed.data;

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const c = cwr.case;

    if (!QUESTION_BY_ID.has(questionId) || !isValidAnswer(questionId, answer)) {
      return fail('VALIDATION_ERROR', 'That is not an answer we offered.');
    }
    const outstanding = [...cwr.questions].reverse().find((q) => q.answerValue === null);
    if (!outstanding || outstanding.questionId !== questionId) {
      return fail('INVALID_STATE', 'That question is not the one we are waiting on.');
    }

    await repo.recordAnswer(c.id, questionId, answer);
    await repo.addEvent(c.id, { type: 'ANSWER_RECORDED', actor: 'USER', summary: `Answered ${questionId}.`, payload: { answer } });

    const derived: FactInput[] = Object.entries(factsFromAnswer(questionId, answer)).map(([key, value]) => ({
      key, value: value!, provenance: 'USER_STATED' as const,
    }));
    if (derived.length) {
      const merged = mergeFacts(await repo.getFacts(c.id), derived);
      await repo.upsertFacts(c.id, merged);
    }

    const mid = (await repo.getCaseByToken(token))!;
    const nq = await nextQuestion(repo, mid.case);
    if (nq.question) {
      await repo.setCaseState(c.id, transition('QUESTIONING', 'ANSWER_MORE').nextState);
    } else {
      await repo.setCaseState(c.id, transition('QUESTIONING', 'ANSWER_STOP').nextState);
      await runDiagnosis(repo, mid.case);
      await repo.setCaseState(c.id, transition('DIAGNOSED', 'ACTIONS_ISSUED').nextState);
    }

    const final = (await repo.getCaseByToken(token))!;
    return ok(envelope(final, { nextQuestion: nq.question }));
  } catch (err) {
    return serverError('POST /api/cases/[token]/answers', err);
  }
}
