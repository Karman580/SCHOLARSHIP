import type { FactKey } from './facts';

export type Weight = { value: string; weight: number };
export type WeightTable = Partial<Record<FactKey, Weight[]>>;

export type Hypothesis = {
  id: string;
  label: string;
  /** Plain description shown in "other possibilities". */
  description: string;
  stage: number;
  prior: number;
  whoMustAct: 'STUDENT_AND_BANK' | 'SCHEME_SIDE' | 'STUDENT';
  supports: WeightTable;
  contradicts: WeightTable;
  /** Hard gate: if the fact is present and its value is not listed, score is zero. */
  requires?: Partial<Record<FactKey, string[]>>;
  disproveBy: string[];
  actionKey: string;
};

/**
 * Priors are PRODUCT JUDGEMENT, not measured frequencies. Said plainly on /about.
 * They sum to 1.00 and are tunable here and only here.
 */
export const HYPOTHESES: Hypothesis[] = [
  {
    id: 'H_DBT_NOT_ENABLED',
    label: 'Your account is not enabled to receive Aadhaar-based benefit payments',
    description:
      'Your account can be linked to Aadhaar and still not be switched on for benefit transfers. These are two different things, and money sent this way bounces if the second one is off.',
    stage: 7,
    prior: 0.2,
    whoMustAct: 'STUDENT_AND_BANK',
    supports: {
      dbt_enabled_reported: [{ value: 'NO', weight: 3.0 }],
      payment_system_result: [{ value: 'RETURNED', weight: 1.6 }, { value: 'PROCESSED', weight: 1.2 }],
      aadhaar_linked_to_account: [{ value: 'NO', weight: 1.4 }],
      peers_paid: [{ value: 'YES', weight: 0.8 }],
      portal_status_code: [{ value: 'SANCTIONED', weight: 0.6 }],
    },
    contradicts: {
      dbt_enabled_reported: [{ value: 'YES', weight: 2.5 }],
      credit_seen: [{ value: 'YES', weight: 3.0 }],
      payment_system_result: [{ value: 'NO_RECORD', weight: 1.5 }],
      // A dormant or closed account, or a confirmed name mismatch, already explains a
      // bounce at the account stage, which makes a routing-layer cause much less likely.
      account_status_reported: [{ value: 'DORMANT', weight: 2.5 }, { value: 'CLOSED', weight: 2.5 }],
      name_matches_bank: [{ value: 'NO', weight: 1.5 }],
    },
    requires: { sanction_seen: ['YES', 'UNKNOWN'] },
    disproveBy: [
      'Your bank confirms the account is enabled for Aadhaar-based benefit payments',
      'The payment system shows no payment record at all for your application',
    ],
    actionKey: 'PLAN_DBT',
  },
  {
    id: 'H_PAYMENT_NOT_INITIATED',
    label: 'Sanctioned, but the payment instruction has not been sent yet',
    description:
      'The sanction exists on paper, but nobody has sent the instruction that actually moves the money. Nothing is wrong at your end.',
    stage: 5,
    prior: 0.16,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      payment_system_result: [{ value: 'NO_RECORD', weight: 2.8 }, { value: 'PENDING', weight: 2.0 }],
      peers_paid: [{ value: 'NO', weight: 1.5 }],
      days_since_sanction: [{ value: '<45', weight: 0.8 }],
    },
    contradicts: {
      payment_system_result: [{ value: 'RETURNED', weight: 2.5 }, { value: 'PROCESSED', weight: 2.5 }],
      credit_seen: [{ value: 'YES', weight: 3.0 }],
    },
    requires: { sanction_seen: ['YES', 'UNKNOWN'] },
    disproveBy: [
      'The payment system shows a payment was processed or returned',
      'Classmates on the same scheme and year have been paid',
    ],
    actionKey: 'PLAN_NOT_INITIATED',
  },
  {
    id: 'H_INSTITUTE_PENDING',
    label: 'Your college has not verified it yet',
    description: 'The application is still waiting for your college to confirm your details.',
    stage: 2,
    prior: 0.12,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      institute_verified: [{ value: 'NO', weight: 2.6 }],
      portal_status_code: [{ value: 'INSTITUTE_PENDING', weight: 3.0 }, { value: 'SUBMITTED', weight: 1.2 }],
      peers_paid: [{ value: 'YES', weight: 0.6 }],
      sanction_seen: [{ value: 'NO', weight: 1.2 }],
    },
    contradicts: {
      institute_verified: [{ value: 'YES', weight: 2.5 }],
      portal_status_code: [
        { value: 'SANCTIONED', weight: 2.0 }, { value: 'PAID', weight: 2.5 },
        { value: 'STATE_PENDING', weight: 2.0 }, { value: 'DEFECTIVE', weight: 1.5 },
      ],
      sanction_seen: [{ value: 'YES', weight: 1.5 }],
      payment_system_result: [{ value: 'RETURNED', weight: 1.5 }, { value: 'PROCESSED', weight: 1.5 }],
    },
    disproveBy: [
      'The portal shows a status past college verification',
      'The college gives you the date on which they verified it',
    ],
    actionKey: 'PLAN_INSTITUTE',
  },
  {
    id: 'H_ACCOUNT_UNUSABLE',
    label: 'Your account is dormant, closed or limited, so the credit bounced',
    description:
      'An account that has not been used for a long time can be frozen for credits. The money is sent, reaches the bank and comes back.',
    stage: 8,
    prior: 0.1,
    whoMustAct: 'STUDENT_AND_BANK',
    supports: {
      account_status_reported: [
        { value: 'DORMANT', weight: 2.6 },
        { value: 'CLOSED', weight: 3.0 },
        { value: 'MIN_KYC', weight: 2.2 },
      ],
      payment_system_result: [{ value: 'RETURNED', weight: 1.8 }],
      account_changed_since_application: [{ value: 'YES', weight: 0.8 }],
    },
    contradicts: {
      credit_seen: [{ value: 'YES', weight: 3.0 }],
      payment_system_result: [{ value: 'NO_RECORD', weight: 2.0 }],
      dbt_enabled_reported: [{ value: 'NO', weight: 1.5 }],
      name_matches_bank: [{ value: 'NO', weight: 1.0 }],
    },
    requires: { account_status_reported: ['DORMANT', 'CLOSED', 'MIN_KYC', 'UNKNOWN'] },
    disproveBy: [
      'The bank confirms the account is active and can take credits',
      'The payment system shows no payment was ever processed',
    ],
    actionKey: 'PLAN_ACCOUNT_UNUSABLE',
  },
  {
    id: 'H_MAPPED_TO_OTHER_ACCOUNT',
    label: 'Your Aadhaar is pointing at a different, probably older account',
    description:
      'Benefit payments follow the last account you linked, not the one you wrote on the form. If an older account still holds that link, the money goes there.',
    stage: 7,
    prior: 0.09,
    whoMustAct: 'STUDENT_AND_BANK',
    supports: {
      multiple_accounts: [{ value: 'YES', weight: 2.4 }],
      account_changed_since_application: [{ value: 'YES', weight: 2.0 }],
      payment_system_result: [{ value: 'PROCESSED', weight: 1.8 }, { value: 'RETURNED', weight: 1.4 }],
      credit_seen: [{ value: 'NO', weight: 0.4 }],
    },
    contradicts: {
      multiple_accounts: [{ value: 'NO', weight: 1.6 }],
      payment_system_result: [{ value: 'NO_RECORD', weight: 1.5 }],
      account_status_reported: [{ value: 'DORMANT', weight: 2.0 }, { value: 'CLOSED', weight: 2.0 }],
      dbt_enabled_reported: [{ value: 'NO', weight: 1.2 }],
      // A confirmed name mismatch or a credit you actually saw both explain the outcome
      // without needing the mapping to be wrong.
      name_matches_bank: [{ value: 'NO', weight: 1.2 }],
      credit_seen: [{ value: 'YES', weight: 2.5 }],
    },
    disproveBy: [
      'You have only ever had one bank account',
      'The bank tells you your Aadhaar link points at this same account',
    ],
    actionKey: 'PLAN_MAPPED_ELSEWHERE',
  },
  {
    id: 'H_STATE_PENDING',
    label: 'It is waiting with the state or the ministry',
    description: 'Your college has done its part and the file is waiting at the level above them.',
    stage: 3,
    prior: 0.08,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      portal_status_code: [{ value: 'STATE_PENDING', weight: 3.0 }],
      institute_verified: [{ value: 'YES', weight: 1.0 }],
      state_verified: [{ value: 'NO', weight: 2.4 }],
      sanction_seen: [{ value: 'NO', weight: 1.2 }],
      peers_paid: [{ value: 'NO', weight: 0.6 }],
    },
    contradicts: {
      state_verified: [{ value: 'YES', weight: 2.2 }],
      portal_status_code: [
        { value: 'SANCTIONED', weight: 2.0 }, { value: 'PAID', weight: 2.5 },
        { value: 'INSTITUTE_PENDING', weight: 2.0 }, { value: 'DEFECTIVE', weight: 1.5 },
      ],
      sanction_seen: [{ value: 'YES', weight: 1.5 }],
      payment_system_result: [{ value: 'RETURNED', weight: 1.5 }, { value: 'PROCESSED', weight: 1.5 }],
    },
    disproveBy: [
      'The portal shows a sanction was issued',
      'The state office gives you the date it cleared their level',
    ],
    actionKey: 'PLAN_STATE',
  },
  {
    id: 'H_PAYMENT_STUCK_AT_AGENCY',
    label: 'The payment is sitting in the payment system, not yet processed',
    description:
      'A payment record exists but has not been pushed through. This is usually a queue or a budget-release delay, not a mistake on your side.',
    stage: 6,
    prior: 0.08,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      payment_system_result: [{ value: 'PENDING', weight: 3.4 }],
      peers_paid: [{ value: 'NO', weight: 1.0 }],
      days_since_sanction: [{ value: '>45', weight: 0.6 }],
    },
    contradicts: {
      payment_system_result: [{ value: 'RETURNED', weight: 2.5 }, { value: 'PROCESSED', weight: 2.0 }, { value: 'NO_RECORD', weight: 1.2 }],
      credit_seen: [{ value: 'YES', weight: 3.0 }],
    },
    requires: { sanction_seen: ['YES', 'UNKNOWN'] },
    disproveBy: [
      'The payment system shows the payment was processed or returned',
      'The payment system shows no record at all',
    ],
    actionKey: 'PLAN_STUCK_AT_AGENCY',
  },
  {
    id: 'H_NAME_MISMATCH',
    label: 'The name on the application and on the bank account do not match',
    description:
      'A short form on one record and a full name on the other is enough for a benefit credit to be rejected.',
    stage: 8,
    prior: 0.06,
    whoMustAct: 'STUDENT_AND_BANK',
    supports: {
      name_matches_bank: [{ value: 'NO', weight: 3.0 }],
      payment_system_result: [{ value: 'RETURNED', weight: 1.6 }],
    },
    contradicts: {
      name_matches_bank: [{ value: 'YES', weight: 2.6 }],
      credit_seen: [{ value: 'YES', weight: 3.0 }],
      payment_system_result: [{ value: 'NO_RECORD', weight: 1.5 }],
      dbt_enabled_reported: [{ value: 'NO', weight: 1.5 }],
    },
    disproveBy: [
      'The bank reads out a name that matches your application exactly',
      'The payment system shows no payment was ever processed',
    ],
    actionKey: 'PLAN_NAME_MISMATCH',
  },
  {
    id: 'H_ALREADY_PAID_UNSEEN',
    label: 'The money has already gone somewhere you have not checked',
    description:
      'The credit may have landed in an older account, or in this one on a date you did not look at.',
    stage: 8,
    prior: 0.05,
    whoMustAct: 'STUDENT',
    supports: {
      payment_system_result: [{ value: 'PROCESSED', weight: 2.6 }],
      passbook_checked_recently: [{ value: 'NO', weight: 1.6 }],
      multiple_accounts: [{ value: 'YES', weight: 1.2 }],
      peers_paid: [{ value: 'YES', weight: 0.6 }],
    },
    contradicts: {
      payment_system_result: [{ value: 'NO_RECORD', weight: 2.0 }, { value: 'RETURNED', weight: 1.5 }],
      passbook_checked_recently: [{ value: 'YES', weight: 1.2 }],
      peers_paid: [{ value: 'NO', weight: 0.5 }],
    },
    disproveBy: [
      'Your statement for the whole period shows no credit in any account you hold',
      'The payment system shows the payment was returned',
    ],
    actionKey: 'PLAN_ALREADY_PAID',
  },
  {
    id: 'H_SANCTION_NOT_ISSUED',
    label: 'It looks approved to you, but no sanction has been issued',
    description:
      'A portal word like "approved" can mean the application cleared a check, not that a sanction order exists.',
    stage: 4,
    prior: 0.04,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      sanction_seen: [{ value: 'NO', weight: 2.2 }],
      portal_status_code: [{ value: 'STATE_PENDING', weight: 1.2 }, { value: 'SUBMITTED', weight: 1.0 }],
      peers_paid: [{ value: 'NO', weight: 0.8 }],
      state_verified: [{ value: 'YES', weight: 0.6 }],
    },
    contradicts: {
      portal_status_code: [
        { value: 'SANCTIONED', weight: 1.5 }, { value: 'PAID', weight: 2.5 },
        { value: 'DEFECTIVE', weight: 1.5 }, { value: 'INSTITUTE_PENDING', weight: 1.5 },
      ],
      payment_system_result: [{ value: 'PROCESSED', weight: 2.0 }, { value: 'RETURNED', weight: 2.0 }],
    },
    disproveBy: [
      'The portal shows a sanction number or a sanction date',
      'The payment system holds a payment record against your application',
    ],
    actionKey: 'PLAN_SANCTION',
  },
  {
    id: 'H_APPLICATION_DEFECTIVE',
    label: 'Your application was marked incomplete or defective',
    description:
      'Something on the form or in the documents was flagged, and the file stops there until it is fixed.',
    stage: 1,
    prior: 0.02,
    whoMustAct: 'SCHEME_SIDE',
    supports: {
      portal_status_code: [{ value: 'DEFECTIVE', weight: 4.6 }, { value: 'REJECTED', weight: 2.6 }],
      institute_verified: [{ value: 'NO', weight: 0.8 }],
    },
    contradicts: {
      portal_status_code: [{ value: 'SANCTIONED', weight: 2.0 }, { value: 'PAID', weight: 2.5 }],
      sanction_seen: [{ value: 'YES', weight: 1.5 }],
      institute_verified: [{ value: 'YES', weight: 1.0 }],
    },
    disproveBy: [
      'The portal shows the application moved past verification',
      'The college confirms no defect is recorded against your application',
    ],
    actionKey: 'PLAN_DEFECTIVE',
  },
];

const PRIOR_SUM = HYPOTHESES.reduce((s, h) => s + h.prior, 0);
if (Math.abs(PRIOR_SUM - 1) > 0.005) {
  throw new Error(`Hypothesis priors must sum to 1.00, got ${PRIOR_SUM.toFixed(3)}`);
}

export const HYPOTHESIS_BY_ID = new Map(HYPOTHESES.map((h) => [h.id, h]));

export function getHypothesis(id: string): Hypothesis {
  const h = HYPOTHESIS_BY_ID.get(id);
  if (!h) throw new Error(`Unknown hypothesis: ${id}`);
  return h;
}

/** Not a hypothesis. The honest result when the evidence does not separate anything. */
export const INSUFFICIENT_INFO = {
  id: 'H_INSUFFICIENT_INFO',
  label: 'We cannot safely narrow this down yet',
} as const;
