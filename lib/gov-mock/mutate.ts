// SIMULATED RECORDS ONLY. Applying an action here changes synthetic rows, nothing else.
import type { GovAccount, GovApplication, GovMapping, GovPayment, MockAction } from '../types';

export type GovRecords = {
  application: GovApplication;
  payment: GovPayment;
  mapping: GovMapping;
  account: GovAccount;
};

/**
 * "Queue at now + N days" is simulated time only: the payment reads as pending until the
 * case's simulated day offset reaches pendingUntilDay. The UI says so in those words.
 */
function queuePayment(r: GovRecords, days: number, fromDay: number): void {
  r.payment.status = 'PROCESSED';
  r.payment.pendingUntilDay = fromDay + days;
  r.payment.processedAt = addDays(r.application.sanctionedAt ?? '2026-01-01', 30 + fromDay + days);
  r.payment.returnReason = null;
  r.payment.paymentId ??= `PAY-DEMO-${r.application.applicationId.split('-').pop()}`;
  r.payment.utr = `UTRDEMO${String(Math.abs(hash(r.application.applicationId + fromDay + days)) % 10000).padStart(4, '0')}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mutates a copy of the records. Returns the changed set plus a plain-words summary. */
export function applyMockAction(
  records: GovRecords,
  action: MockAction,
  simulatedDayOffset: number,
): { records: GovRecords; summary: string; advanceDays: number } {
  const r = structuredClone(records);
  switch (action) {
    case 'BANK_SEEDED_DBT':
      r.account.aadhaarSeeded = true;
      r.account.dbtEnabled = true;
      r.mapping.dbtEnabled = true;
      r.mapping.mappedBank = r.account.bankName;
      r.mapping.lastUpdated = addDays(r.application.sanctionedAt ?? '2026-01-01', 30 + simulatedDayOffset);
      queuePayment(r, 2, simulatedDayOffset);
      return { records: r, summary: 'Demo bank record now shows the account enabled for benefit transfers. A payment was queued in demo time.', advanceDays: 2 };

    case 'ACCOUNT_REACTIVATED':
      r.account.accountStatus = 'ACTIVE';
      queuePayment(r, 2, simulatedDayOffset);
      return { records: r, summary: 'Demo bank record now shows the account active. A payment was queued in demo time.', advanceDays: 2 };

    case 'NAME_CORRECTED':
      r.account.nameOnAccount = r.application.nameOnApplication;
      if (r.account.accountStatus === 'DORMANT') r.account.accountStatus = 'ACTIVE';
      queuePayment(r, 3, simulatedDayOffset);
      return { records: r, summary: 'Demo records now hold the same name on both sides. A payment was queued in demo time.', advanceDays: 3 };

    case 'NEW_ACCOUNT_PROVIDED': {
      const newRef = `${r.account.bankRefId}-NEW`;
      r.account = {
        bankRefId: newRef,
        bankName: r.account.bankName,
        accountMasked: 'XXXXXX0088',
        accountStatus: 'ACTIVE',
        nameOnAccount: r.application.nameOnApplication,
        aadhaarSeeded: true,
        dbtEnabled: true,
      };
      r.application.bankRefId = newRef;
      r.mapping.mappedBank = r.account.bankName;
      r.mapping.dbtEnabled = true;
      queuePayment(r, 5, simulatedDayOffset);
      return { records: r, summary: 'Demo records now point at a new enabled account. A payment was queued in demo time.', advanceDays: 5 };
    }

    case 'INSTITUTE_VERIFIED':
      r.application.instituteVerifiedAt = addDays(r.application.sanctionedAt ?? '2026-01-01', simulatedDayOffset);
      if (r.application.stateVerifiedAt && !r.application.sanctionedAt) {
        r.application.sanctionedAt = addDays(r.application.instituteVerifiedAt, 7);
      }
      return { records: r, summary: 'Demo application record now shows college verification complete.', advanceDays: 0 };

    case 'PAYMENT_REPUSHED':
      queuePayment(r, 2, simulatedDayOffset);
      return { records: r, summary: 'A payment was queued again in demo time.', advanceDays: 2 };

    case 'NOTHING_HAPPENED':
      return { records: r, summary: 'Nothing changed in the demo records.', advanceDays: 0 };
  }
}

/** A queued payment reads as pending until simulated time catches up. */
export function effectivePayment(payment: GovPayment, simulatedDayOffset: number): GovPayment {
  if (payment.pendingUntilDay !== null && simulatedDayOffset < payment.pendingUntilDay) {
    return { ...payment, status: 'PENDING_AT_AGENCY', utr: null, processedAt: null };
  }
  return payment;
}
