import { describe, expect, it } from 'vitest';
import { bandFor, diagnose, matchesNumericPredicate, scoreAll } from '@/lib/engine/diagnose';
import type { FactMap } from '@/lib/engine/facts';
import { HYPOTHESES } from '@/lib/engine/hypotheses';

const f = (o: Record<string, string>): FactMap =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, provenance: 'USER_STATED' as const }]));

/**
 * Golden table. Changing a weight without updating this table fails CI, which is the
 * point: the ranking is the product, so it may not drift silently.
 */
const GOLDEN: { name: string; facts: FactMap; top: string; band: string }[] = [
  { name: 'nothing known at all', facts: f({}), top: 'H_DBT_NOT_ENABLED', band: 'LOW' },
  { name: 'all explicitly unknown', facts: f({ credit_seen: 'UNKNOWN', payment_system_result: 'UNKNOWN', dbt_enabled_reported: 'UNKNOWN' }), top: 'H_DBT_NOT_ENABLED', band: 'LOW' },
  { name: 'demo case 1', facts: f({ sanction_seen: 'YES', portal_status_code: 'SANCTIONED', institute_verified: 'YES', credit_seen: 'NO', peers_paid: 'YES', aadhaar_linked_to_account: 'YES', days_since_sanction: '>60', payment_system_result: 'RETURNED', dbt_enabled_reported: 'NO' }), top: 'H_DBT_NOT_ENABLED', band: 'HIGH' },
  { name: 'demo case 2', facts: f({ sanction_seen: 'YES', portal_status_code: 'SANCTIONED', institute_verified: 'YES', credit_seen: 'NO', peers_paid: 'NO', account_status_reported: 'ACTIVE', days_since_sanction: '>60', payment_system_result: 'NO_RECORD' }), top: 'H_PAYMENT_NOT_INITIATED', band: 'HIGH' },
  { name: 'demo case 3', facts: f({ sanction_seen: 'YES', portal_status_code: 'SANCTIONED', credit_seen: 'NO', account_status_reported: 'DORMANT', payment_system_result: 'RETURNED' }), top: 'H_ACCOUNT_UNUSABLE', band: 'MEDIUM' },
  { name: 'payment pending in the system', facts: f({ sanction_seen: 'YES', payment_system_result: 'PENDING', peers_paid: 'NO' }), top: 'H_PAYMENT_STUCK_AT_AGENCY', band: 'LOW' },
  { name: 'portal marks it defective', facts: f({ portal_status_code: 'DEFECTIVE', sanction_seen: 'NO', credit_seen: 'NO' }), top: 'H_APPLICATION_DEFECTIVE', band: 'MEDIUM' },
  { name: 'college has not verified', facts: f({ portal_status_code: 'INSTITUTE_PENDING', institute_verified: 'NO', sanction_seen: 'NO' }), top: 'H_INSTITUTE_PENDING', band: 'HIGH' },
  { name: 'waiting at the state', facts: f({ portal_status_code: 'STATE_PENDING', institute_verified: 'YES', state_verified: 'NO', sanction_seen: 'NO' }), top: 'H_STATE_PENDING', band: 'MEDIUM' },
  { name: 'processed but nothing seen, passbook not checked', facts: f({ sanction_seen: 'YES', payment_system_result: 'PROCESSED', passbook_checked_recently: 'NO', multiple_accounts: 'YES' }), top: 'H_ALREADY_PAID_UNSEEN', band: 'LOW' },
  { name: 'name explicitly differs', facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', name_matches_bank: 'NO', credit_seen: 'NO' }), top: 'H_NAME_MISMATCH', band: 'MEDIUM' },
  { name: 'changed banks after applying', facts: f({ sanction_seen: 'YES', payment_system_result: 'PROCESSED', account_changed_since_application: 'YES', multiple_accounts: 'YES', credit_seen: 'NO' }), top: 'H_MAPPED_TO_OTHER_ACCOUNT', band: 'MEDIUM' },
  { name: 'account closed', facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', account_status_reported: 'CLOSED' }), top: 'H_ACCOUNT_UNUSABLE', band: 'HIGH' },
  { name: 'DBT confirmed enabled kills the DBT hypothesis', facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', dbt_enabled_reported: 'YES' }), top: 'H_ACCOUNT_UNUSABLE', band: 'LOW' },
  { name: 'money already seen', facts: f({ sanction_seen: 'YES', credit_seen: 'YES', payment_system_result: 'PROCESSED' }), top: 'H_ALREADY_PAID_UNSEEN', band: 'HIGH' },
  { name: 'no sanction yet, nobody paid', facts: f({ sanction_seen: 'NO', peers_paid: 'NO', portal_status_code: 'SUBMITTED' }), top: 'H_SANCTION_NOT_ISSUED', band: 'LOW' },
  { name: 'only a sanction is known', facts: f({ sanction_seen: 'YES', portal_status_code: 'SANCTIONED' }), top: 'H_DBT_NOT_ENABLED', band: 'LOW' },
  { name: 'recent sanction, no payment record', facts: f({ sanction_seen: 'YES', payment_system_result: 'NO_RECORD', days_since_sanction: '<30' }), top: 'H_PAYMENT_NOT_INITIATED', band: 'HIGH' },
  { name: 'peers paid, credit not seen, nothing else', facts: f({ sanction_seen: 'YES', peers_paid: 'YES', credit_seen: 'NO' }), top: 'H_DBT_NOT_ENABLED', band: 'LOW' },
  { name: 'dormant account but no payment record at all', facts: f({ sanction_seen: 'YES', account_status_reported: 'DORMANT', payment_system_result: 'NO_RECORD' }), top: 'H_PAYMENT_NOT_INITIATED', band: 'HIGH' },
];

describe('diagnosis engine', () => {
  for (const row of GOLDEN) {
    it(`${row.name} -> ${row.top} (${row.band})`, () => {
      const d = diagnose(row.facts);
      expect(d.topHypothesisId).toBe(row.top);
      expect(d.band).toBe(row.band);
    });
  }

  it('normalises confidences to a distribution', () => {
    const total = scoreAll(f({ sanction_seen: 'YES', payment_system_result: 'RETURNED' })).reduce((s, x) => s + x.confidence, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('gives back the priors when nothing is known', () => {
    const scored = scoreAll(f({}));
    for (const s of scored) expect(s.confidence).toBeCloseTo(s.hypothesis.prior, 3);
  });

  it('zeroes a hypothesis whose requires-gate is violated', () => {
    const scored = scoreAll(f({ sanction_seen: 'NO', account_status_reported: 'ACTIVE' }));
    const dbt = scored.find((s) => s.hypothesis.id === 'H_DBT_NOT_ENABLED')!;
    const unusable = scored.find((s) => s.hypothesis.id === 'H_ACCOUNT_UNUSABLE')!;
    expect(dbt.confidence).toBe(0);
    expect(unusable.confidence).toBe(0);
  });

  it('treats UNKNOWN as contributing nothing', () => {
    const a = scoreAll(f({ sanction_seen: 'YES' }));
    const b = scoreAll(f({ sanction_seen: 'YES', dbt_enabled_reported: 'UNKNOWN', credit_seen: 'UNKNOWN' }));
    expect(a.map((x) => x.confidence)).toEqual(b.map((x) => x.confidence));
  });

  it('suppresses a hypothesis its contradicting evidence rules out', () => {
    const withReturn = scoreAll(f({ sanction_seen: 'YES', payment_system_result: 'RETURNED' }));
    const notInitiated = withReturn.find((s) => s.hypothesis.id === 'H_PAYMENT_NOT_INITIATED')!;
    const dbt = withReturn.find((s) => s.hypothesis.id === 'H_DBT_NOT_ENABLED')!;
    expect(notInitiated.confidence).toBeLessThan(dbt.confidence / 5);
  });

  it('bands on the documented thresholds', () => {
    expect(bandFor([{ confidence: 0.7 }, { confidence: 0.3 }] as never)).toBe('HIGH');
    expect(bandFor([{ confidence: 0.7 }, { confidence: 0.5 }] as never)).toBe('MEDIUM');
    expect(bandFor([{ confidence: 0.6 }, { confidence: 0.1 }] as never)).toBe('MEDIUM');
    expect(bandFor([{ confidence: 0.45 }, { confidence: 0.4 }] as never)).toBe('MEDIUM');
    expect(bandFor([{ confidence: 0.3 }, { confidence: 0.25 }] as never)).toBe('LOW');
  });

  it('priors sum to one', () => {
    expect(HYPOTHESES.reduce((s, h) => s + h.prior, 0)).toBeCloseTo(1, 5);
  });

  it('evaluates numeric range predicates', () => {
    expect(matchesNumericPredicate('>60', '>45')).toBe(true);
    expect(matchesNumericPredicate('>60', '<45')).toBe(false);
    expect(matchesNumericPredicate('<30', '<45')).toBe(true);
    expect(matchesNumericPredicate('75', '>45')).toBe(true);
    expect(matchesNumericPredicate('UNKNOWN', '>45')).toBe(false);
  });

  it('gives every hypothesis a disproveBy and an action plan', () => {
    for (const h of HYPOTHESES) {
      expect(h.disproveBy.length).toBeGreaterThan(0);
      expect(h.actionKey).toBeTruthy();
    }
  });
});
