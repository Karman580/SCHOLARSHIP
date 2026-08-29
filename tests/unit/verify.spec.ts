import { describe, expect, it } from 'vitest';
import { compareJourneys } from '@/lib/engine/verify';
import { applyMockAction, effectivePayment, type GovRecords } from '@/lib/gov-mock/mutate';
import { seedFor } from '@/lib/gov-mock/seed';
import type { JourneyStage, MockAction } from '@/lib/types';

const stage = (stageId: number, status: JourneyStage['status']): JourneyStage => ({
  stageId, label: `stage ${stageId}`, status, provenance: 'SIMULATED',
});

const records = (caseNo: 1 | 2 | 3): GovRecords => {
  const s = seedFor(caseNo);
  return { application: s.application, payment: s.payment, mapping: s.mapping, account: s.account };
};

describe('verification comparison', () => {
  it('resolves only when stage 8 is confirmed', () => {
    const before = [stage(7, 'BLOCKED'), stage(8, 'NOT_REACHED')];
    expect(compareJourneys(before, [stage(7, 'CONFIRMED'), stage(8, 'CONFIRMED')])).toBe('RESOLVED');
  });

  it('reports progress when a stage advances but the credit has not landed', () => {
    const before = [stage(6, 'UNKNOWN'), stage(8, 'NOT_REACHED')];
    expect(compareJourneys(before, [stage(6, 'CONFIRMED'), stage(8, 'NOT_REACHED')])).toBe('PROGRESSED');
  });

  it('reports no change when nothing moved', () => {
    const before = [stage(6, 'UNKNOWN'), stage(7, 'BLOCKED'), stage(8, 'NOT_REACHED')];
    expect(compareJourneys(before, before)).toBe('NO_CHANGE');
  });
});

describe('mock mutations', () => {
  const cases: { action: MockAction; check: (r: GovRecords) => void }[] = [
    { action: 'BANK_SEEDED_DBT', check: (r) => { expect(r.account.dbtEnabled).toBe(true); expect(r.mapping.dbtEnabled).toBe(true); expect(r.payment.status).toBe('PROCESSED'); } },
    { action: 'ACCOUNT_REACTIVATED', check: (r) => { expect(r.account.accountStatus).toBe('ACTIVE'); expect(r.payment.status).toBe('PROCESSED'); } },
    { action: 'NAME_CORRECTED', check: (r) => { expect(r.account.nameOnAccount).toBe(r.application.nameOnApplication); } },
    { action: 'NEW_ACCOUNT_PROVIDED', check: (r) => { expect(r.account.dbtEnabled).toBe(true); expect(r.application.bankRefId).toBe(r.account.bankRefId); } },
    { action: 'PAYMENT_REPUSHED', check: (r) => { expect(r.payment.status).toBe('PROCESSED'); } },
  ];

  for (const { action, check } of cases) {
    it(`${action} produces the documented record change`, () => {
      const { records: after } = applyMockAction(records(1), action, 0);
      check(after);
    });
  }

  it('NOTHING_HAPPENED changes nothing and advances no simulated time', () => {
    const before = records(1);
    const { records: after, advanceDays } = applyMockAction(before, 'NOTHING_HAPPENED', 0);
    expect(after).toEqual(before);
    expect(advanceDays).toBe(0);
  });

  it('a queued payment reads as pending until simulated time catches up', () => {
    const { records: after, advanceDays } = applyMockAction(records(1), 'BANK_SEEDED_DBT', 0);
    expect(effectivePayment(after.payment, 0).status).toBe('PENDING_AT_AGENCY');
    expect(effectivePayment(after.payment, 0).utr).toBeNull();
    expect(effectivePayment(after.payment, advanceDays).status).toBe('PROCESSED');
    expect(effectivePayment(after.payment, advanceDays).utr).toBeTruthy();
  });

  it('never invents an Aadhaar number', () => {
    const { records: after } = applyMockAction(records(3), 'NEW_ACCOUNT_PROVIDED', 0);
    expect(JSON.stringify(after)).not.toMatch(/\b\d{12}\b/);
    expect(after.mapping.aliasKey).toMatch(/^ALIAS-DEMO-/);
  });
});
