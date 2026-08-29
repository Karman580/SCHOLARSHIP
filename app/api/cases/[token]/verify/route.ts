import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { redact } from '@/lib/redact';
import { outcomeById } from '@/lib/engine/actions';
import { buildJourney } from '@/lib/engine/journey';
import { compareJourneys } from '@/lib/engine/verify';
import { diagnose } from '@/lib/engine/diagnose';
import { toFactMap } from '@/lib/engine/facts';
import { transition } from '@/lib/engine/machine';
import { envelope, govSnapshot, nextEscalationRung, runDiagnosis } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';
import type { CaseState } from '@/lib/types';

export const runtime = 'nodejs';

const Body = z.object({
  actionId: z.string().min(1),
  outcome: z.string().min(1).max(60),
  note: z.string().max(1000).optional(),
}).strict();

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
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

    const action = cwr.actions.find((a) => a.id === parsed.data.actionId);
    if (!action) return fail('CASE_NOT_FOUND', 'We cannot find that step.');
    const outcome = outcomeById(action, parsed.data.outcome);
    if (!outcome) return fail('VALIDATION_ERROR', 'That is not an outcome we offered for this step.');

    if (parsed.data.note?.trim()) {
      await repo.addEvidence(c.id, { kind: 'NOTE', content: redact(parsed.data.note) });
    }
    await repo.completeAction(c.id, action.id, outcome.id);

    const facts = toFactMap(cwr.facts);
    const { band: bandBefore, topHypothesisId: topBefore, scored: scoredBefore } = diagnose(facts);

    // Snapshot the synthetic world before we touch it, so the comparison is like for like.
    const govBefore = await govSnapshot(repo, c);
    const previous = buildJourney({
      facts, topHypothesisId: topBefore, runnerUpHypothesisId: scoredBefore[1]?.hypothesis.id,
      band: bandBefore, gov: govBefore,
    });

    // 1. The completed action changes the synthetic world.
    const applied = c.applicationId
      ? await repo.gov.applyRealWorldAction({ applicationId: c.applicationId, action: outcome.mockAction, simulatedDayOffset: c.simulatedDayOffset })
      : { summary: 'No demo records are attached to this case, so nothing changed in them.', advanceDays: 0 };
    await repo.addEvent(c.id, { type: 'GOV_RECORD_CHANGED', actor: 'DEMO_GOV', summary: applied.summary, payload: { mockAction: outcome.mockAction } });

    // 2. Demo time moves forward so a queued credit can appear. Never real time.
    let simulatedAdvance = 0;
    if (applied.advanceDays > 0) {
      await repo.advanceSimulatedDays(c.id, applied.advanceDays);
      simulatedAdvance = applied.advanceDays;
    }

    await repo.setCaseState(c.id, transition(c.state === 'VERIFYING' ? 'VERIFYING' : 'AWAITING_VERIFICATION', 'VERIFY_SUBMITTED').nextState);

    // 3. Re-query the mock services and recompute.
    const after = (await repo.getCaseByToken(token))!.case;
    const gov = await govSnapshot(repo, after);
    const { band, topHypothesisId, scored } = diagnose(facts);
    const journey = buildJourney({ facts, topHypothesisId, runnerUpHypothesisId: scored[1]?.hypothesis.id, band, gov });
    const result = compareJourneys(previous, journey);

    await repo.addEvent(c.id, { type: 'VERIFICATION_RUN', actor: 'SAATHI', summary: `Checked again: ${result.toLowerCase().replace('_', ' ')}.`, payload: { result } });

    let nextState: CaseState;
    let nextActions = cwr.actions;
    if (result === 'RESOLVED') {
      nextState = transition('VERIFYING', 'VERIFY_RESOLVED').nextState;
      await repo.addEvent(c.id, { type: 'CASE_RESOLVED', actor: 'SAATHI', summary: 'The demo records now show the credit.' });
    } else if (result === 'PROGRESSED') {
      nextState = transition('VERIFYING', 'VERIFY_PROGRESSED').nextState;
      const run = await runDiagnosis(repo, after, { includeGov: true });
      nextActions = run.actions;
    } else if (result === 'NEEDS_MORE_INFO') {
      nextState = transition('VERIFYING', 'VERIFY_NEEDS_INFO').nextState;
    } else {
      nextState = transition('VERIFYING', 'VERIFY_NO_CHANGE').nextState;
    }
    await repo.setCaseState(c.id, nextState);

    const final = (await repo.getCaseByToken(token))!;
    const esc = nextEscalationRung(final);
    const creditSimulated =
      result === 'RESOLVED' && gov?.application && gov.payment
        ? {
            amountPaise: gov.application.amountPaise,
            dateIso: gov.payment.processedAt,
            accountMasked: gov.account?.accountMasked ?? null,
            utr: gov.payment.utr,
          }
        : undefined;

    return ok({
      result,
      journey,
      simulatedAdvance,
      creditSimulated,
      nextActions: result === 'PROGRESSED' ? nextActions : undefined,
      escalation: result === 'NO_CHANGE' ? { currentRung: esc.current, nextRung: esc.next?.id ?? null, artifactType: esc.next?.artifactType ?? null } : undefined,
      case: envelope(final).case,
    });
  } catch (err) {
    return serverError('POST verify', err);
  }
}
