import type { Band, GovAccount, GovApplication, GovMapping, GovPayment, JourneyStage, JourneyStatus, Provenance } from '../types';
import { type FactMap, factValue } from './facts';
import { getHypothesis } from './hypotheses';

export const STAGES: { id: number; label: string }[] = [
  { id: 1, label: 'Application submitted' },
  { id: 2, label: 'College verification' },
  { id: 3, label: 'State / ministry verification' },
  { id: 4, label: 'Sanction issued' },
  { id: 5, label: 'Payment instruction sent' },
  { id: 6, label: 'Payment system processing' },
  { id: 7, label: 'Aadhaar-to-bank routing' },
  { id: 8, label: 'Credit to your account' },
];

export type GovSnapshot = {
  application: GovApplication | null;
  payment: GovPayment | null;
  mapping: GovMapping | null;
  account: GovAccount | null;
};

type Attested = { status: JourneyStatus; provenance: Provenance; note?: string };

/**
 * A stage is CONFIRMED only where a fact the student gave us, or a synthetic record,
 * directly attests it. Everything else stays UNKNOWN with a dashed connector — that
 * dashed line is the honesty device.
 */
function attestations(facts: FactMap, gov?: GovSnapshot): Map<number, Attested> {
  const a = new Map<number, Attested>();
  const set = (id: number, v: Attested) => {
    const prev = a.get(id);
    if (!prev || rank(v.status) > rank(prev.status)) a.set(id, v);
  };

  const statusCode = factValue(facts, 'portal_status_code');
  const sanctionSeen = factValue(facts, 'sanction_seen');
  const instituteVerified = factValue(facts, 'institute_verified');
  const stateVerified = factValue(facts, 'state_verified');
  const payment = factValue(facts, 'payment_system_result');
  const credit = factValue(facts, 'credit_seen');

  if (statusCode || sanctionSeen) set(1, { status: 'CONFIRMED', provenance: 'USER_STATED', note: 'You can see it on the portal.' });
  if (instituteVerified === 'YES') set(2, { status: 'CONFIRMED', provenance: 'USER_STATED' });
  if (stateVerified === 'YES') set(3, { status: 'CONFIRMED', provenance: 'USER_STATED' });
  if (sanctionSeen === 'YES' || statusCode === 'SANCTIONED' || statusCode === 'PAID') {
    set(4, { status: 'CONFIRMED', provenance: 'USER_STATED', note: 'The portal shows a sanction.' });
  }
  if (payment === 'PENDING' || payment === 'PROCESSED' || payment === 'RETURNED') {
    set(5, { status: 'CONFIRMED', provenance: 'USER_STATED', note: 'A payment record exists, so the instruction went out.' });
  }
  if (payment === 'PROCESSED' || payment === 'RETURNED') {
    set(6, { status: 'CONFIRMED', provenance: 'USER_STATED', note: 'The payment system has finished with it.' });
  }
  // A returned payment does NOT by itself confirm that routing worked: a payment can be
  // rejected at the routing layer because the account is not enabled for benefit transfers.
  // Routing is only confirmed when the bounce clearly happened at the account itself.
  const bouncedAtAccount =
    ['DORMANT', 'CLOSED', 'MIN_KYC'].includes(factValue(facts, 'account_status_reported') ?? '') ||
    factValue(facts, 'name_matches_bank') === 'NO';
  if (payment === 'RETURNED' && bouncedAtAccount) {
    set(7, { status: 'CONFIRMED', provenance: 'USER_STATED', note: 'It reached your bank and came back.' });
  }
  if (credit === 'YES') set(8, { status: 'CONFIRMED', provenance: 'USER_STATED' });

  if (gov) {
    const { application, payment: p, mapping, account } = gov;
    if (application) {
      set(1, { status: 'CONFIRMED', provenance: 'SIMULATED', note: `Application ${application.applicationId}` });
      if (application.instituteVerifiedAt) set(2, { status: 'CONFIRMED', provenance: 'SIMULATED', note: `Verified ${application.instituteVerifiedAt}` });
      if (application.stateVerifiedAt) set(3, { status: 'CONFIRMED', provenance: 'SIMULATED', note: `Verified ${application.stateVerifiedAt}` });
      if (application.sanctionedAt) set(4, { status: 'CONFIRMED', provenance: 'SIMULATED', note: `Sanctioned ${application.sanctionedAt}` });
    }
    if (p && p.status !== 'NO_RECORD') {
      set(5, { status: 'CONFIRMED', provenance: 'SIMULATED', note: 'Payment instruction exists in our demo records.' });
      if (p.status === 'PROCESSED' || p.status === 'RETURNED') {
        set(6, { status: 'CONFIRMED', provenance: 'SIMULATED', note: `Payment ${p.status.toLowerCase()}` });
      }
    }
    if (mapping?.dbtEnabled && account?.dbtEnabled) {
      set(7, { status: 'CONFIRMED', provenance: 'SIMULATED', note: 'Routing is switched on in our demo records.' });
    }
    // Same rule for the synthetic records: a return caused by the account not being enabled
    // for benefit transfers is a routing-layer failure, not proof that routing worked.
    if (p?.status === 'RETURNED' && p.returnReason !== 'ACCOUNT_NOT_DBT_ENABLED') {
      set(7, { status: 'CONFIRMED', provenance: 'SIMULATED', note: 'It reached the bank and came back.' });
    }
    if (p?.status === 'PROCESSED' && account?.accountStatus === 'ACTIVE' && account.dbtEnabled) {
      set(8, { status: 'CONFIRMED', provenance: 'SIMULATED', note: p.utr ? `Credit reference ${p.utr}` : undefined });
    }
  }
  return a;
}

const ORDER: JourneyStatus[] = ['NOT_REACHED', 'UNKNOWN', 'LIKELY', 'BLOCKED', 'CONFIRMED'];
const rank = (s: JourneyStatus) => ORDER.indexOf(s);

export function buildJourney(input: {
  facts: FactMap;
  topHypothesisId: string;
  runnerUpHypothesisId?: string;
  band: Band;
  gov?: GovSnapshot;
}): JourneyStage[] {
  const { facts, topHypothesisId, runnerUpHypothesisId, band, gov } = input;
  const attested = attestations(facts, gov);
  const blockedStage = band === 'LOW' ? null : getHypothesis(topHypothesisId).stage;
  const lowStages =
    band === 'LOW'
      ? new Set([getHypothesis(topHypothesisId).stage, runnerUpHypothesisId ? getHypothesis(runnerUpHypothesisId).stage : -1])
      : new Set<number>();

  return STAGES.map(({ id, label }) => {
    const att = attested.get(id);
    if (att && att.status === 'CONFIRMED') {
      return { stageId: id, label, status: 'CONFIRMED' as const, provenance: att.provenance, note: att.note };
    }
    if (band === 'LOW' && lowStages.has(id)) {
      return {
        stageId: id,
        label,
        status: 'UNKNOWN' as const,
        provenance: 'AI_INFERENCE' as Provenance,
        note: "One of these two — we can't tell yet.",
      };
    }
    if (blockedStage !== null && id === blockedStage) {
      return { stageId: id, label, status: 'BLOCKED' as const, provenance: 'AI_INFERENCE' as Provenance, note: 'This is where we think it is stuck.' };
    }
    if (blockedStage !== null && id < blockedStage) {
      // Implied by the blocked stage being reached, but nothing attests it directly.
      return { stageId: id, label, status: 'LIKELY' as const, provenance: 'AI_INFERENCE' as Provenance, note: 'Implied, not confirmed.' };
    }
    if (blockedStage !== null && id > blockedStage) {
      return { stageId: id, label, status: 'NOT_REACHED' as const, provenance: 'AI_INFERENCE' as Provenance };
    }
    return { stageId: id, label, status: 'UNKNOWN' as const, provenance: 'AI_INFERENCE' as Provenance, note: 'Nobody can see this from where you stand.' };
  });
}
