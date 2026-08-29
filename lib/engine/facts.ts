import type { Fact, FactInput, Provenance } from '../types';

export const FACT_KEYS = [
  'scheme_type', 'academic_year', 'portal', 'application_id', 'portal_status_raw',
  'portal_status_code', 'sanction_seen', 'days_since_sanction', 'institute_verified',
  'state_verified', 'payment_system_result', 'bank_account_given', 'account_status_reported',
  'aadhaar_linked_to_account', 'dbt_enabled_reported', 'multiple_accounts',
  'account_changed_since_application', 'name_matches_bank', 'passbook_checked_recently',
  'credit_seen', 'peers_paid', 'fee_deadline_pressure',
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

const YNU = ['YES', 'NO', 'UNKNOWN'] as const;

/** Allowed values per key. `null` means free text (still redacted before storage). */
export const FACT_VALUES: Record<FactKey, readonly string[] | null> = {
  scheme_type: ['PRE_MATRIC', 'POST_MATRIC', 'MERIT_CUM_MEANS', 'TOP_CLASS', 'STATE_SCHEME', 'UNKNOWN'],
  academic_year: null,
  portal: ['NATIONAL', 'STATE', 'UNKNOWN'],
  application_id: null,
  portal_status_raw: null,
  portal_status_code: ['SUBMITTED', 'DEFECTIVE', 'INSTITUTE_PENDING', 'STATE_PENDING', 'SANCTIONED', 'PAID', 'REJECTED', 'UNKNOWN'],
  sanction_seen: YNU,
  days_since_sanction: null,
  institute_verified: YNU,
  state_verified: YNU,
  payment_system_result: ['NO_RECORD', 'PENDING', 'PROCESSED', 'RETURNED', 'UNKNOWN'],
  bank_account_given: YNU,
  account_status_reported: ['ACTIVE', 'DORMANT', 'CLOSED', 'MIN_KYC', 'UNKNOWN'],
  aadhaar_linked_to_account: YNU,
  dbt_enabled_reported: YNU,
  multiple_accounts: YNU,
  account_changed_since_application: YNU,
  name_matches_bank: YNU,
  passbook_checked_recently: YNU,
  credit_seen: YNU,
  peers_paid: YNU,
  fee_deadline_pressure: YNU,
};

export const FACT_LABELS: Record<FactKey, string> = {
  scheme_type: 'Scholarship type',
  academic_year: 'Academic year',
  portal: 'Which portal',
  application_id: 'Application number',
  portal_status_raw: 'What the portal shows',
  portal_status_code: 'Portal status',
  sanction_seen: 'Sanction shown to you',
  days_since_sanction: 'Days since that status appeared',
  institute_verified: 'College verification',
  state_verified: 'State verification',
  payment_system_result: 'Payment system result',
  bank_account_given: 'Bank account given on the application',
  account_status_reported: 'Account status',
  aadhaar_linked_to_account: 'Aadhaar linked to the account',
  dbt_enabled_reported: 'Account enabled for benefit payments',
  multiple_accounts: 'More than one account',
  account_changed_since_application: 'Account changed since applying',
  name_matches_bank: 'Name matches the bank record',
  passbook_checked_recently: 'Passbook checked recently',
  credit_seen: 'Money seen in the account',
  peers_paid: 'Classmates paid',
  fee_deadline_pressure: 'Fee deadline pressure',
};

/** Human-readable rendering of a stored fact value. */
export function factValueLabel(key: FactKey, value: string): string {
  const v = value.toUpperCase();
  const generic: Record<string, string> = {
    YES: 'Yes', NO: 'No', UNKNOWN: 'Not known yet',
    SANCTIONED: 'Sanctioned', SUBMITTED: 'Submitted', DEFECTIVE: 'Marked defective',
    INSTITUTE_PENDING: 'Waiting with the college', STATE_PENDING: 'Waiting with the state',
    PAID: 'Shown as paid', REJECTED: 'Rejected',
    NO_RECORD: 'No payment record found', PENDING: 'Payment pending', PROCESSED: 'Payment processed',
    RETURNED: 'Payment returned',
    ACTIVE: 'In normal use', DORMANT: 'Not used for a long time', CLOSED: 'Closed',
    MIN_KYC: 'Limited (minimum KYC)',
    PRE_MATRIC: 'Pre-Matric', POST_MATRIC: 'Post-Matric', MERIT_CUM_MEANS: 'Merit-cum-Means',
    TOP_CLASS: 'Top Class', STATE_SCHEME: 'State scheme',
    NATIONAL: 'National portal', STATE: "State portal",
  };
  if (key === 'days_since_sanction') {
    if (v === 'UNKNOWN') return 'Not known yet';
    if (value.startsWith('>')) return `More than ${value.slice(1)} days`;
    if (value.startsWith('<')) return `Less than ${value.slice(1)} days`;
    return `${value} days`;
  }
  return generic[v] ?? value;
}

export function isFactKey(k: string): k is FactKey {
  return (FACT_KEYS as readonly string[]).includes(k);
}

/** Values that carry no information. Absence is never treated as evidence. */
export function isUnknown(value: string | undefined | null): boolean {
  return !value || value.toUpperCase() === 'UNKNOWN';
}

export function normaliseFactValue(key: FactKey, raw: string): string | null {
  const allowed = FACT_VALUES[key];
  const v = raw.trim();
  if (!v) return null;
  if (allowed === null) return v.slice(0, 400);
  const up = v.toUpperCase().replace(/[\s-]+/g, '_');
  return allowed.includes(up) ? up : null;
}

const RANK: Record<Provenance, number> = {
  PUBLIC_RULE: 3,
  USER_STATED: 3,
  SIMULATED: 2,
  AI_INFERENCE: 1,
};

export type FactMap = Record<string, { value: string; provenance: Provenance; confidence?: number | null; quote?: string | null }>;

export function toFactMap(facts: Fact[]): FactMap {
  const m: FactMap = {};
  for (const f of facts) m[f.key] = { value: f.value, provenance: f.provenance, confidence: f.confidence, quote: f.quote };
  return m;
}

export function factValue(map: FactMap, key: FactKey): string | undefined {
  const v = map[key]?.value;
  return isUnknown(v) ? undefined : v;
}

/**
 * Merge newly extracted facts into what we already hold.
 * A USER_STATED fact is never overwritten by an AI_INFERENCE one, and an existing
 * value is never replaced by UNKNOWN.
 */
export function mergeFacts(existing: Fact[], incoming: FactInput[]): FactInput[] {
  const current = toFactMap(existing);
  const out: FactInput[] = [];
  for (const f of incoming) {
    if (!isFactKey(f.key)) continue;
    const value = normaliseFactValue(f.key, f.value);
    if (value === null) continue;
    const prev = current[f.key];
    if (isUnknown(value)) {
      if (prev) continue; // never downgrade a known value to UNKNOWN
    }
    if (prev) {
      if (prev.value === value) continue;
      if (RANK[prev.provenance] > RANK[f.provenance]) continue;
    }
    out.push({ ...f, value });
  }
  return out;
}
