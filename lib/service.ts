import type {
  Action, Band, Case, CaseWithRelations, Diagnosis, JourneyStage, KnownItem, Language, UnknownItem,
} from './types';
import type { Repo } from './db/repo';
import { FACT_LABELS, factValueLabel, isFactKey, toFactMap, type FactKey, type FactMap } from './engine/facts';
import { diagnose, ENGINE_VERSION } from './engine/diagnose';
import { buildJourney, type GovSnapshot } from './engine/journey';
import { insufficientInfoPlan, planFor } from './engine/actions';
import { QUESTION_BANK, QUESTION_BY_ID, rankCandidates, selectNext, MAX_QUESTIONS } from './engine/questions';
import { explain } from './ai/explain';
import { phraseQuestion, type PhrasedQuestion } from './ai/question';
import { effectivePayment } from './gov-mock/mutate';

/** What the student has told us, each line carrying where it came from. */
export function buildKnown(facts: FactMap): KnownItem[] {
  const out: KnownItem[] = [];
  for (const [key, entry] of Object.entries(facts)) {
    if (!isFactKey(key) || entry.value === 'UNKNOWN') continue;
    if (key === 'portal_status_raw') continue;
    out.push({
      text: `${FACT_LABELS[key]}: ${factValueLabel(key, entry.value)}`,
      provenance: entry.provenance,
    });
  }
  return out;
}

const UNKNOWN_HOWTO: Partial<Record<FactKey, string>> = {
  dbt_enabled_reported:
    'Ask at your bank counter whether the account is enabled for Aadhaar-based benefit transfers, not just linked. Ask for both answers in writing.',
  payment_system_result:
    'Look your application up on the public payment-tracking page and note the exact status word and any reason text.',
  account_status_reported: 'Ask the branch whether the account is active, dormant, closed or limited.',
  name_matches_bank: 'Ask the counter to read out the name held on the account and compare it word for word with your application.',
  institute_verified: 'Ask the college nodal officer for the date they verified your application.',
  state_verified: 'Ask the college for the date and reference under which it was sent onward.',
  multiple_accounts: 'Check whether you hold any other account that could be carrying your Aadhaar link.',
  credit_seen: 'Update your passbook and read every entry from the sanction date onwards.',
  peers_paid: 'Ask two classmates on the same scheme and year whether they have been paid.',
  days_since_sanction: 'Note the date the portal first showed this status.',
  sanction_seen: 'Check whether the portal shows a sanction number or a sanction date, not just an approval word.',
  aadhaar_linked_to_account: 'Ask the bank whether your Aadhaar is seeded to this account.',
  account_changed_since_application: 'Check whether the account you gave on the form is still the one you use.',
  passbook_checked_recently: 'Update your passbook so you are working from current information.',
};

/**
 * The "what we don't know" block is mandatory and can never render empty.
 * If nothing is outstanding, we surface the single highest-value remaining check instead.
 */
export function buildUnknown(facts: FactMap, askedIds: string[], topDisproveBy: string[]): UnknownItem[] {
  const out: UnknownItem[] = [];
  const wanted: FactKey[] = ['payment_system_result', 'dbt_enabled_reported', 'account_status_reported', 'name_matches_bank', 'institute_verified', 'multiple_accounts'];
  for (const k of wanted) {
    if (facts[k] && facts[k]!.value !== 'UNKNOWN') continue;
    const howToFindOut = UNKNOWN_HOWTO[k];
    if (!howToFindOut) continue;
    out.push({ id: k, text: `We do not know: ${FACT_LABELS[k].toLowerCase()}.`, howToFindOut });
    if (out.length >= 4) break;
  }
  if (out.length) return out;

  const best = rankCandidates(facts, askedIds)[0];
  if (best) {
    return [{
      id: best.question.id,
      text: `One thing could still change this answer: ${best.question.prompt.toLowerCase()}`,
      howToFindOut: best.question.howToCheck?.steps.join(' ') ?? 'Bring us the answer and we will re-run the diagnosis.',
    }];
  }
  return [{
    id: 'DISPROVE',
    text: 'One thing could still change this answer.',
    howToFindOut: topDisproveBy[0] ?? 'If any of the checks above comes back differently, tell us and we will re-run this.',
  }];
}

export async function govSnapshot(repo: Repo, c: Case): Promise<GovSnapshot | undefined> {
  if (!c.applicationId) return undefined;
  const application = await repo.gov.getApplication(c.applicationId);
  if (!application) return undefined;
  const rawPayment = await repo.gov.getPayment(c.applicationId);
  return {
    application,
    payment: rawPayment ? effectivePayment(rawPayment, c.simulatedDayOffset) : null,
    mapping: await repo.gov.getMapping(application.aliasKey),
    account: await repo.gov.getAccount(application.bankRefId),
  };
}

export type DiagnosisRun = { diagnosis: Diagnosis; actions: Action[] };

/**
 * The engine decides. The model only turns the result into words — and if it is
 * unavailable the ranking is byte-for-byte identical, only the wording changes.
 */
export async function runDiagnosis(
  repo: Repo,
  c: Case,
  opts: { includeGov?: boolean } = {},
): Promise<DiagnosisRun> {
  const facts = toFactMap(await repo.getFacts(c.id));
  const questions = await repo.getQuestions(c.id);
  const askedIds = questions.map((q) => q.questionId);

  const { scored, band, ranked, topHypothesisId } = diagnose(facts);
  const runnerUpId = scored[1]?.hypothesis.id;
  const gov = opts.includeGov ? await govSnapshot(repo, c) : undefined;
  const journey = buildJourney({ facts, topHypothesisId, runnerUpHypothesisId: runnerUpId, band, gov });

  const known = buildKnown(facts);
  const unknown = buildUnknown(facts, askedIds, ranked[0]?.disproveBy ?? []);

  const explained = await explain({ band, ranked, known, unknown, journey, language: c.language });
  if (explained.mode === 'fallback' && c.aiMode !== 'fallback') {
    await repo.setAiMode(c.id, 'fallback');
    await repo.addEvent(c.id, { type: 'AI_FALLBACK_USED', actor: 'SAATHI', summary: 'Explanation came from built-in rules.' });
  }

  const rankedWithWhy = ranked.map((r, i) =>
    i === 0 ? { ...r, why: explained.why.length ? explained.why : r.why } : r,
  );
  const unknownWithText = unknown.map((u) => {
    const hit = explained.unknownExplained.find((x) => x.id === u.id);
    return hit ? { ...u, howToFindOut: hit.text } : u;
  });

  const diagnosis = await repo.saveDiagnosis(c.id, {
    ranked: rankedWithWhy,
    topHypothesis: topHypothesisId,
    band,
    known,
    unknown: unknownWithText,
    journey,
    verdictText: explained.verdictText,
    engineVersion: ENGINE_VERSION,
  });
  await repo.addEvent(c.id, {
    type: 'DIAGNOSIS_CREATED',
    actor: 'SAATHI',
    summary: `Ranked ${ranked.length} possibilities, band ${band}.`,
    payload: { band, top: topHypothesisId },
  });

  const plan = band === 'LOW' ? insufficientInfoPlan(facts, askedIds) : planFor(topHypothesisId, facts);
  const actions = await repo.saveActions(c.id, diagnosis.id, plan);
  await repo.addEvent(c.id, { type: 'ACTIONS_ISSUED', actor: 'SAATHI', summary: `Issued ${actions.length} steps.` });

  return { diagnosis, actions };
}

export type NextQuestion = { question: PhrasedQuestion | null; askedCount: number; expectedRemaining: number };

export async function nextQuestion(repo: Repo, c: Case): Promise<NextQuestion> {
  const facts = toFactMap(await repo.getFacts(c.id));
  const asked = await repo.getQuestions(c.id);
  const askedIds = asked.map((q) => q.questionId);
  let consecutiveSkips = 0;
  for (let i = asked.length - 1; i >= 0; i--) {
    if (asked[i]!.answerValue === 'SKIPPED') consecutiveSkips++;
    else break;
  }

  const answeredCount = asked.filter((q) => q.answerValue !== null).length;

  // A question already put to the student stays the outstanding one. Re-rendering the
  // page must not roll a new question or write a second row.
  const outstanding = asked.find((q) => q.answerValue === null);
  if (outstanding) {
    const def = QUESTION_BY_ID.get(outstanding.questionId);
    if (def) {
      return {
        question: {
          id: def.id,
          prompt: outstanding.promptShown,
          why: def.why,
          options: def.options.map((o) => ({ id: o.id, label: o.label })),
          allowDontKnow: true,
          howToCheck: def.howToCheck ? { steps: def.howToCheck.steps, provenance: 'PUBLIC_RULE' as const } : undefined,
          mode: c.aiMode === 'fallback' ? ('fallback' as const) : ('model' as const),
        },
        askedCount: answeredCount,
        expectedRemaining: Math.max(1, MAX_QUESTIONS - answeredCount),
      };
    }
  }

  const sel = selectNext(facts, { askedIds, consecutiveSkips });
  if (sel.done) return { question: null, askedCount: answeredCount, expectedRemaining: 0 };

  const phrased = await phraseQuestion(sel.candidates, c.language);
  if (phrased.mode === 'fallback' && c.aiMode !== 'fallback') {
    await repo.setAiMode(c.id, 'fallback');
  }
  await repo.recordQuestion(c.id, { questionId: phrased.id, promptShown: phrased.prompt, seq: asked.length + 1 });
  await repo.addEvent(c.id, { type: 'QUESTION_ASKED', actor: 'SAATHI', summary: phrased.prompt });

  return {
    question: phrased,
    askedCount: answeredCount,
    expectedRemaining: Math.max(1, Math.min(MAX_QUESTIONS - answeredCount, sel.candidates.length)),
  };
}

export type CaseEnvelope = {
  case: {
    token: string; state: string; isDemo: boolean; demoCaseNo: number | null;
    language: Language; aiMode: string; simulatedDayOffset: number; createdAt: string; updatedAt: string;
  };
  facts: { key: string; label: string; value: string; display: string; provenance: string; confidence: number | null; quote: string | null }[];
  journey?: JourneyStage[];
  diagnosis?: DiagnosisView | null;
  actions?: Action[];
  artifacts?: { id: string; type: string; recipient: string; subject: string | null; language: string }[];
  unreadableFiles?: string[];
  nextQuestion?: PhrasedQuestion | null;
};

export type DiagnosisView = {
  id: string;
  band: Band;
  verdictText: string;
  top: { hypothesisId: string; label: string; confidence: number };
  ranked: Diagnosis['ranked'];
  known: KnownItem[];
  unknown: UnknownItem[];
  journey: JourneyStage[];
  engineVersion: string;
};

export function diagnosisView(d: Diagnosis | null): DiagnosisView | null {
  if (!d) return null;
  const top = d.ranked[0]!;
  return {
    id: d.id,
    band: d.band,
    verdictText: d.verdictText,
    top: { hypothesisId: top.hypothesisId, label: top.label, confidence: top.confidence },
    ranked: d.ranked,
    known: d.known,
    unknown: d.unknown,
    journey: d.journey,
    engineVersion: d.engineVersion,
  };
}

export function envelope(cwr: CaseWithRelations, extra: Partial<CaseEnvelope> = {}): CaseEnvelope {
  const c = cwr.case;
  return {
    case: {
      token: c.token, state: c.state, isDemo: c.isDemo, demoCaseNo: c.demoCaseNo,
      language: c.language, aiMode: c.aiMode, simulatedDayOffset: c.simulatedDayOffset,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    },
    facts: cwr.facts
      .filter((f) => isFactKey(f.key))
      .map((f) => ({
        key: f.key,
        label: FACT_LABELS[f.key as FactKey],
        value: f.value,
        display: factValueLabel(f.key as FactKey, f.value),
        provenance: f.provenance,
        confidence: f.confidence,
        quote: f.quote ?? null,
      })),
    diagnosis: diagnosisView(cwr.diagnosis),
    actions: cwr.actions,
    artifacts: cwr.artifacts.map((a) => ({ id: a.id, type: a.type, recipient: a.recipient, subject: a.subject, language: a.language })),
    journey: cwr.diagnosis?.journey,
    ...extra,
  };
}

/** Fields we could not extract, for the "We could not find" list. */
export function missingFacts(facts: FactMap): { key: FactKey; label: string }[] {
  const interesting: FactKey[] = ['scheme_type', 'academic_year', 'portal_status_code', 'sanction_seen', 'payment_system_result', 'account_status_reported', 'dbt_enabled_reported', 'name_matches_bank'];
  return interesting
    .filter((k) => !facts[k] || facts[k]!.value === 'UNKNOWN')
    .map((k) => ({ key: k, label: FACT_LABELS[k] }));
}

export const QUESTION_IDS = QUESTION_BANK.map((q) => q.id);
export { QUESTION_BY_ID };

/* ------------------------------------------------------------------ artifacts */

import type { ArtifactType } from './types';
import type { DraftContext } from './ai/fallback';
import { ladderFor, nextRung, rungById } from './engine/escalation';
import { factValue } from './engine/facts';

export function buildDraftContext(
  cwr: CaseWithRelations,
  type: ArtifactType,
  language: Language,
): DraftContext {
  const facts = toFactMap(cwr.facts);
  const d = cwr.diagnosis;
  const currentRungId = cwr.escalations.at(-1)?.rung ?? null;
  const top = d?.topHypothesis ?? 'H_PAYMENT_NOT_INITIATED';
  const rung = (currentRungId ? rungById(currentRungId) : null) ?? ladderFor(top)[0]!;

  return {
    type,
    language,
    scheme: factValue(facts, 'scheme_type')
      ? `${factValueLabel('scheme_type', factValue(facts, 'scheme_type')!)} scholarship`
      : 'scholarship scheme',
    academicYear: factValue(facts, 'academic_year') ?? '[[academic year]]',
    applicationRef: factValue(facts, 'application_id') ?? '[[your application number]]',
    topHypothesisLabel: d?.ranked[0]?.label ?? 'the payment has not reached your account',
    band: d?.band ?? 'LOW',
    known: (d?.known ?? buildKnown(facts)).map((k) => k.text),
    alreadyDone: cwr.actions.filter((a) => a.completedAt).map((a) => a.title),
    rungLabel: rung.label,
    journey: d?.journey,
    verdictText: d?.verdictText,
  };
}

export function nextEscalationRung(cwr: CaseWithRelations) {
  const top = cwr.diagnosis?.topHypothesis ?? 'H_PAYMENT_NOT_INITIATED';
  const current = cwr.escalations.at(-1)?.rung ?? null;
  return { ladder: ladderFor(top), current, next: nextRung(top, current) };
}
