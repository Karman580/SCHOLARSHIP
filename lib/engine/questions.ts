import type { Provenance } from '../types';
import { type FactKey, type FactMap } from './facts';
import { bandFor, scoreAll } from './diagnose';

export type AnswerOption = {
  id: string;
  label: string;
  /** Facts this answer establishes. Everything here becomes USER_STATED. */
  facts: Partial<Record<FactKey, string>>;
};

export type QuestionDef = {
  id: string;
  prompt: string;
  /** Names the two possibilities this separates, in plain words. */
  why: string;
  resolves: FactKey[];
  options: AnswerOption[];
  /** 0 = knows now, 1 = must look at passbook/app, 2 = must ask college or bank. */
  cost: 0 | 1 | 2;
  howToCheck?: { steps: string[]; provenance: Provenance };
};

export const QUESTION_BANK: QuestionDef[] = [
  {
    id: 'Q_STATUS_CODE',
    prompt: 'What does the portal show right now?',
    why: 'This tells us whether your file is still moving through checks, or has already been sanctioned.',
    resolves: ['portal_status_code', 'sanction_seen'],
    cost: 0,
    options: [
      { id: 'SANCTIONED', label: 'Sanctioned or approved', facts: { portal_status_code: 'SANCTIONED', sanction_seen: 'YES' } },
      { id: 'UNDER_PROCESS', label: 'Under process', facts: { portal_status_code: 'STATE_PENDING', sanction_seen: 'NO' } },
      { id: 'DEFECTIVE', label: 'Defective or incomplete', facts: { portal_status_code: 'DEFECTIVE', sanction_seen: 'NO' } },
      { id: 'INSTITUTE_VERIFIED', label: 'Verified by college', facts: { portal_status_code: 'INSTITUTE_PENDING', institute_verified: 'YES' } },
    ],
  },
  {
    id: 'Q_CREDIT_SEEN',
    prompt: 'Have you checked your bank passbook or app in the last week?',
    why: 'This separates money that never arrived from money that arrived and was not noticed.',
    resolves: ['credit_seen', 'passbook_checked_recently'],
    cost: 1,
    options: [
      { id: 'CHECKED_NOTHING', label: 'Yes, nothing came', facts: { credit_seen: 'NO', passbook_checked_recently: 'YES' } },
      { id: 'CHECKED_SOMETHING', label: 'Yes, something came', facts: { credit_seen: 'YES', passbook_checked_recently: 'YES' } },
      { id: 'NOT_CHECKED', label: 'Not checked', facts: { passbook_checked_recently: 'NO' } },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'Update the passbook at your branch or the passbook machine, or open the bank app.',
        'Look at every entry from the sanction date onwards, not just the balance.',
        'Benefit credits often appear with a scheme code, not the scheme name.',
      ],
    },
  },
  {
    id: 'Q_PFMS_LOOKUP',
    prompt: 'Have you looked up your payment on the payment-tracking page?',
    why: 'This separates a payment that was never sent from one that was sent and came back.',
    resolves: ['payment_system_result'],
    cost: 1,
    options: [
      { id: 'NO_RECORD', label: 'No record found', facts: { payment_system_result: 'NO_RECORD' } },
      { id: 'PROCESSED', label: 'Shows processed', facts: { payment_system_result: 'PROCESSED' } },
      { id: 'RETURNED', label: 'Shows returned', facts: { payment_system_result: 'RETURNED' } },
      { id: 'NOT_CHECKED', label: "Haven't checked", facts: {} },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'Public payment-tracking pages usually ask for your application or beneficiary reference.',
        'Note down exactly what the status word is, and any reason text next to it.',
        'If it says returned, the reason text is the single most useful thing you can bring back here.',
      ],
    },
  },
  {
    id: 'Q_DBT_STATUS',
    prompt: 'Has your bank told you the account is enabled for Aadhaar-based benefit payments, not just linked?',
    why: 'Linked and enabled are two different switches. This separates a routing problem from a bank-account problem.',
    resolves: ['dbt_enabled_reported', 'aadhaar_linked_to_account'],
    cost: 2,
    options: [
      { id: 'ENABLED', label: 'Yes, enabled', facts: { dbt_enabled_reported: 'YES', aadhaar_linked_to_account: 'YES' } },
      { id: 'NOT_ENABLED', label: 'No, not enabled', facts: { dbt_enabled_reported: 'NO' } },
      { id: 'LINKED_ONLY', label: 'Linked but not for benefits', facts: { dbt_enabled_reported: 'NO', aadhaar_linked_to_account: 'YES' } },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'Go to the branch with your passbook and photo ID.',
        'Ask in these words: "Is this account seeded with my Aadhaar AND enabled for DBT benefit transfers?"',
        'The two answers can differ. Ask them to write down both, with the date.',
      ],
    },
  },
  {
    id: 'Q_ACCOUNT_ACTIVE',
    prompt: 'Is the account you gave still in normal use?',
    why: 'This separates an account that cannot accept a credit from one that can.',
    resolves: ['account_status_reported'],
    cost: 1,
    options: [
      { id: 'IN_USE', label: 'Yes, I use it', facts: { account_status_reported: 'ACTIVE' } },
      { id: 'UNUSED_YEAR', label: 'Not used for over a year', facts: { account_status_reported: 'DORMANT' } },
      { id: 'CLOSED', label: "It's closed", facts: { account_status_reported: 'CLOSED' } },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'An account with no customer-led transaction for a long period is commonly marked inactive or dormant.',
        'The branch can tell you the status and what is needed to make it active again.',
      ],
    },
  },
  {
    id: 'Q_ACCOUNT_CHANGED',
    prompt: 'Did you open a new account or change banks after applying?',
    why: 'This separates money sent to the account you expect from money sent to an older linked account.',
    resolves: ['account_changed_since_application', 'multiple_accounts'],
    cost: 0,
    options: [
      { id: 'CHANGED', label: 'Yes', facts: { account_changed_since_application: 'YES', multiple_accounts: 'YES' } },
      { id: 'SAME', label: 'No', facts: { account_changed_since_application: 'NO', multiple_accounts: 'NO' } },
    ],
  },
  {
    id: 'Q_NAME_MATCH',
    prompt: 'Is your name spelled the same on the application and in the bank?',
    why: 'This separates a bounced credit caused by the account itself from one caused by a name that did not match.',
    resolves: ['name_matches_bank'],
    cost: 1,
    options: [
      { id: 'SAME', label: 'Same', facts: { name_matches_bank: 'YES' } },
      { id: 'DIFFERENT', label: 'Different', facts: { name_matches_bank: 'NO' } },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'Take a printout of the application and your passbook to the counter.',
        'Ask the staff to read out the name exactly as it is held on the account.',
        'Compare initials, expanded names and spellings character by character.',
      ],
    },
  },
  {
    id: 'Q_INSTITUTE',
    prompt: 'Has your college confirmed they verified it?',
    why: 'This separates a file still waiting at the college from one that has already moved past them.',
    resolves: ['institute_verified'],
    cost: 2,
    options: [
      { id: 'DONE', label: 'Yes, they said done', facts: { institute_verified: 'YES' } },
      { id: 'NOT_DONE', label: 'No', facts: { institute_verified: 'NO' } },
      { id: 'WAIT', label: 'Told me to wait', facts: {} },
    ],
    howToCheck: {
      provenance: 'PUBLIC_RULE',
      steps: [
        'Ask your college nodal or institute officer for the date they verified your application.',
        'Ask whether anything is pending from your side, in writing if possible.',
      ],
    },
  },
  {
    id: 'Q_PEERS',
    prompt: 'Have classmates on the same scholarship been paid?',
    why: 'This separates a problem with the whole batch from a problem with your record alone.',
    resolves: ['peers_paid'],
    cost: 0,
    options: [
      { id: 'MOST_PAID', label: 'Yes, most got it', facts: { peers_paid: 'YES' } },
      { id: 'NOBODY', label: 'No, nobody got it', facts: { peers_paid: 'NO' } },
    ],
  },
  {
    id: 'Q_DAYS_SINCE',
    prompt: 'Roughly how long has it shown that status?',
    why: 'This separates a payment that is simply still in the normal queue from one that has stalled.',
    resolves: ['days_since_sanction'],
    cost: 0,
    options: [
      { id: 'UNDER_MONTH', label: 'Under 1 month', facts: { days_since_sanction: '<30' } },
      { id: 'ONE_TO_THREE', label: '1 to 3 months', facts: { days_since_sanction: '30-90' } },
      { id: 'OVER_THREE', label: 'Over 3 months', facts: { days_since_sanction: '>90' } },
    ],
  },
  {
    id: 'Q_DEADLINE',
    prompt: 'Is there a fee deadline you are worried about?',
    why: 'This does not change the diagnosis. It changes what we tell you to do first.',
    resolves: ['fee_deadline_pressure'],
    cost: 0,
    options: [
      { id: 'YES', label: 'Yes', facts: { fee_deadline_pressure: 'YES' } },
      { id: 'NO', label: 'No', facts: { fee_deadline_pressure: 'NO' } },
    ],
  },
];

export const QUESTION_BY_ID = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export const MAX_QUESTIONS = 5;
export const MIN_GAIN = 0.02;

export function entropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) if (p > 0) h -= p * Math.log2(p);
  return h;
}

function withFacts(facts: FactMap, add: Partial<Record<FactKey, string>>): FactMap {
  const next: FactMap = { ...facts };
  for (const [k, v] of Object.entries(add)) {
    if (v) next[k] = { value: v, provenance: 'USER_STATED' };
  }
  return next;
}

function distribution(facts: FactMap): number[] {
  return scoreAll(facts).map((s) => s.confidence);
}

/** Expected reduction in entropy if we ask this question. Answers weighted uniformly. */
export function expectedGain(q: QuestionDef, facts: FactMap): number {
  const base = entropy(distribution(facts));
  const informative = q.options.filter((o) => Object.keys(o.facts).length > 0);
  if (!informative.length) return 0;
  let expected = 0;
  for (const o of informative) expected += entropy(distribution(withFacts(facts, o.facts))) / informative.length;
  return base - expected;
}

export type Candidate = { question: QuestionDef; gain: number };

/** Top candidates by information gain, ties broken by how hard the answer is to get. */
export function rankCandidates(facts: FactMap, askedIds: string[]): Candidate[] {
  const asked = new Set(askedIds);
  return QUESTION_BANK.filter((q) => !asked.has(q.id))
    .filter((q) => q.resolves.some((k) => !facts[k] || facts[k]!.value === 'UNKNOWN'))
    .map((q) => ({ question: q, gain: expectedGain(q, facts) }))
    .sort((a, b) => b.gain - a.gain || a.question.cost - b.question.cost || a.question.id.localeCompare(b.question.id));
}

export type SelectionState = {
  askedIds: string[];
  consecutiveSkips: number;
};

export type Selection =
  | { done: true; reason: 'BAND_HIGH' | 'MAX_QUESTIONS' | 'NO_GAIN' | 'SKIPPED_OUT' | 'EXHAUSTED' }
  | { done: false; candidates: Candidate[] };

export function selectNext(facts: FactMap, state: SelectionState): Selection {
  if (bandFor(scoreAll(facts)) === 'HIGH') return { done: true, reason: 'BAND_HIGH' };
  if (state.askedIds.length >= MAX_QUESTIONS) return { done: true, reason: 'MAX_QUESTIONS' };
  if (state.consecutiveSkips >= 3) return { done: true, reason: 'SKIPPED_OUT' };
  const candidates = rankCandidates(facts, state.askedIds);
  if (!candidates.length) return { done: true, reason: 'EXHAUSTED' };
  if (candidates[0]!.gain < MIN_GAIN) return { done: true, reason: 'NO_GAIN' };
  return { done: false, candidates: candidates.slice(0, 3) };
}

/**
 * Answer -> facts. DONT_KNOW and SKIPPED establish nothing, which is not the same as
 * establishing UNKNOWN: they simply mark the question as asked so it is never repeated.
 */
export function factsFromAnswer(questionId: string, answer: string): Partial<Record<FactKey, string>> {
  if (answer === 'DONT_KNOW' || answer === 'SKIPPED') return {};
  const q = QUESTION_BY_ID.get(questionId);
  const opt = q?.options.find((o) => o.id === answer);
  return opt ? opt.facts : {};
}

export function isValidAnswer(questionId: string, answer: string): boolean {
  if (answer === 'DONT_KNOW' || answer === 'SKIPPED') return true;
  const q = QUESTION_BY_ID.get(questionId);
  return Boolean(q?.options.some((o) => o.id === answer));
}
