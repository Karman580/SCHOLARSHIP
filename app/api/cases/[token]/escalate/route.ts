import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { rungById } from '@/lib/engine/escalation';
import { transition } from '@/lib/engine/machine';
import { draft } from '@/lib/ai/draft';
import { buildDraftContext, envelope, nextEscalationRung } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ toRung: z.string().max(40).optional() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req, 'model');
  if (limited) return limited;
  const { token } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');

    const { next } = nextEscalationRung(cwr);
    const rung = parsed.data.toRung ? rungById(parsed.data.toRung) : next;
    if (!rung) return fail('INVALID_STATE', 'You are already at the last step of the ladder we can help with.');

    const out = await draft(buildDraftContext(cwr, rung.artifactType, cwr.case.language));
    const artifact = await repo.saveArtifact(cwr.case.id, {
      type: out.type, language: cwr.case.language, recipient: out.recipient, subject: out.subject,
      body: out.body, placeholders: out.placeholders, generatedBy: out.generatedBy,
    });
    const escalation = await repo.addEscalation(cwr.case.id, rung.id, artifact.id);
    await repo.addEvent(cwr.case.id, { type: 'ESCALATED', actor: 'USER', summary: `Moved up to: ${rung.label}.`, payload: { rung: rung.id } });
    await repo.setCaseState(cwr.case.id, transition(cwr.case.state, 'ESCALATE').nextState);

    const final = (await repo.getCaseByToken(token))!;
    return ok({ escalation, artifact, rung, case: envelope(final).case });
  } catch (err) {
    return serverError('POST escalate', err);
  }
}
