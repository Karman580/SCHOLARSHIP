/**
 * Runs a demo case end to end with no HTTP and no browser, so a broken diagnosis is
 * caught by `pnpm seed` before a judge ever sees it. Shares the exact modules the
 * routes use — this is the app's own engine, not a parallel copy.
 */
import type { Repo } from './db/repo';
import type { Band, JourneyStage } from './types';
import { seedFor } from './gov-mock/seed';
import { extract } from './ai/extract';
import { mergeFacts, toFactMap } from './engine/facts';
import { factsFromAnswer } from './engine/questions';
import { diagnose } from './engine/diagnose';
import { buildJourney } from './engine/journey';
import { planFor, insufficientInfoPlan, outcomeById } from './engine/actions';
import { compareJourneys, type VerifyResult } from './engine/verify';
import { applyMockAction, effectivePayment, type GovRecords } from './gov-mock/mutate';
import { nextEscalationRung } from './service';
import { nextQuestion, runDiagnosis } from './service';

/** What the demo student answers, keyed by question id. Anything else is "don't know". */
export const DEMO_ANSWERS: Record<number, Record<string, string>> = {
  1: { Q_PFMS_LOOKUP: 'RETURNED', Q_DBT_STATUS: 'LINKED_ONLY', Q_PEERS: 'MOST_PAID' },
  2: { Q_PFMS_LOOKUP: 'NO_RECORD', Q_PEERS: 'NOBODY', Q_ACCOUNT_ACTIVE: 'IN_USE' },
  3: { Q_PFMS_LOOKUP: 'RETURNED', Q_ACCOUNT_ACTIVE: 'UNUSED_YEAR', Q_NAME_MATCH: 'DONT_KNOW' },
};

/** The outcome the judge picks on the verification screen. */
export const DEMO_OUTCOMES: Record<number, string> = {
  1: 'SEEDED_NOW',
  2: 'NO_REFERENCE',
  3: 'REACTIVATED_NAME_DIFF',
};

export type DemoRunResult = {
  caseNo: number;
  token: string;
  band: Band;
  topHypothesis: string;
  runnerUp: string;
  askedQuestions: string[];
  journeyBefore: JourneyStage[];
  verifyResult: VerifyResult;
  finalState: string;
  aiMode: string;
};

export async function runDemoCase(repo: Repo, caseNo: 1 | 2 | 3): Promise<DemoRunResult> {
  const seed = seedFor(caseNo);
  await repo.gov.resetSeed(caseNo);

  const c = await repo.createCase({ isDemo: true, demoCaseNo: caseNo, applicationId: seed.application.applicationId });
  await repo.setCaseState(c.id, 'INTAKE');
  const extracted = await extract({ description: seed.intakeText, statusText: seed.statusText, images: [] });
  if (extracted.mode === 'fallback') {
    await repo.setAiMode(c.id, 'fallback');
    await repo.addEvent(c.id, { type: 'AI_FALLBACK_USED', actor: 'SAATHI', summary: 'Extraction came from built-in rules.' });
  }
  await repo.upsertFacts(
    c.id,
    mergeFacts([], [
      ...extracted.facts,
      { key: 'application_id', value: seed.application.applicationId, provenance: 'SIMULATED' },
      { key: 'academic_year', value: seed.application.academicYear, provenance: 'SIMULATED' },
    ]),
  );
  await repo.setCaseState(c.id, 'EXTRACTED');

  // Answer questions exactly as the demo script says, until the engine stops asking.
  const askedQuestions: string[] = [];
  for (let i = 0; i < 6; i++) {
    const fresh = (await repo.getCaseByToken(c.token))!;
    const nq = await nextQuestion(repo, fresh.case);
    if (!nq.question) break;
    await repo.setCaseState(c.id, 'QUESTIONING');
    const answer = DEMO_ANSWERS[caseNo]?.[nq.question.id] ?? 'DONT_KNOW';
    askedQuestions.push(`${nq.question.id}=${answer}`);
    await repo.recordAnswer(c.id, nq.question.id, answer);
    const derived = Object.entries(factsFromAnswer(nq.question.id, answer)).map(([key, value]) => ({
      key, value: value!, provenance: 'USER_STATED' as const,
    }));
    if (derived.length) await repo.upsertFacts(c.id, mergeFacts(await repo.getFacts(c.id), derived));
  }

  await repo.setCaseState(c.id, 'DIAGNOSED');
  const withFacts = (await repo.getCaseByToken(c.token))!;
  const { diagnosis, actions } = await runDiagnosis(repo, withFacts.case);
  await repo.setCaseState(c.id, 'ACTION_PLANNED');

  const facts = toFactMap(await repo.getFacts(c.id));
  const scored = diagnose(facts);

  // Snapshot the synthetic world before the action, so before and after are comparable.
  const appBefore = await repo.gov.getApplication(seed.application.applicationId);
  const payBefore = await repo.gov.getPayment(seed.application.applicationId);
  const govBefore = appBefore
    ? {
        application: appBefore,
        payment: payBefore ? effectivePayment(payBefore, 0) : null,
        mapping: await repo.gov.getMapping(appBefore.aliasKey),
        account: await repo.gov.getAccount(appBefore.bankRefId),
      }
    : undefined;
  const journeyBefore = buildJourney({
    facts,
    topHypothesisId: scored.topHypothesisId,
    runnerUpHypothesisId: scored.scored[1]?.hypothesis.id,
    band: scored.band,
    gov: govBefore,
  });

  // Verification: complete a step, mutate the synthetic world, look again.
  const outcomeId = DEMO_OUTCOMES[caseNo]!;
  const action = actions.find((a) => a.body.outcomes.some((o) => o.id === outcomeId)) ?? actions[0]!;
  const outcome = outcomeById(action, outcomeId) ?? action.body.outcomes[0]!;
  await repo.completeAction(c.id, action.id, outcome.id);
  await repo.setCaseState(c.id, 'AWAITING_VERIFICATION');
  await repo.setCaseState(c.id, 'VERIFYING');

  const applied = await repo.gov.applyRealWorldAction({
    applicationId: seed.application.applicationId,
    action: outcome.mockAction,
    simulatedDayOffset: 0,
  });
  if (applied.advanceDays > 0) await repo.advanceSimulatedDays(c.id, applied.advanceDays);

  const after = (await repo.getCaseByToken(c.token))!.case;
  const application = await repo.gov.getApplication(seed.application.applicationId);
  const rawPayment = await repo.gov.getPayment(seed.application.applicationId);
  const gov = application
    ? {
        application,
        payment: rawPayment ? effectivePayment(rawPayment, after.simulatedDayOffset) : null,
        mapping: await repo.gov.getMapping(application.aliasKey),
        account: await repo.gov.getAccount(application.bankRefId),
      }
    : undefined;

  const journeyAfter = buildJourney({
    facts,
    topHypothesisId: scored.topHypothesisId,
    runnerUpHypothesisId: scored.scored[1]?.hypothesis.id,
    band: scored.band,
    gov,
  });
  const verifyResult = compareJourneys(journeyBefore, journeyAfter);

  if (verifyResult === 'RESOLVED') {
    await repo.setCaseState(c.id, 'RESOLVED');
  } else if (verifyResult === 'NO_CHANGE') {
    await repo.setCaseState(c.id, 'AWAITING_VERIFICATION');
    // Two rungs of the ladder, each dated, which is what the next authority needs.
    for (let i = 0; i < 2; i++) {
      const cur = (await repo.getCaseByToken(c.token))!;
      const { next } = nextEscalationRung(cur);
      if (!next) break;
      await repo.addEscalation(c.id, next.id);
      await repo.setCaseState(c.id, 'ESCALATED');
    }
  } else if (verifyResult === 'PROGRESSED') {
    await repo.setCaseState(c.id, 'ACTION_PLANNED');
  } else {
    await repo.setCaseState(c.id, 'QUESTIONING');
  }

  const final = (await repo.getCaseByToken(c.token))!;
  return {
    caseNo,
    token: c.token,
    band: diagnosis.band,
    topHypothesis: diagnosis.topHypothesis,
    runnerUp: diagnosis.ranked[1]?.hypothesisId ?? '',
    askedQuestions,
    journeyBefore,
    verifyResult,
    finalState: final.case.state,
    aiMode: final.case.aiMode,
  };
}

/** Kept exported so tests can assert the LOW-band plan is information-gathering only. */
export { planFor, insufficientInfoPlan };
export type { GovRecords };
export { applyMockAction };
