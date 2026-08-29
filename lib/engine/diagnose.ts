import type { Band, RankedHypothesis } from '../types';
import { type FactMap, type FactKey, isUnknown } from './facts';
import { HYPOTHESES, type Hypothesis, type Weight } from './hypotheses';

export const ENGINE_VERSION = 'engine-1.0.0';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));

/**
 * Numeric facts may be exact ('75') or a range ('>60', '<30', '30-90').
 * A rule predicate ('<45', '>45') is tested against the interval's representative point.
 * ponytail: midpoint comparison, open ends capped at +60 days. Good enough to separate
 * "recent" from "long overdue"; swap for a proper interval calculus only if a rule ever
 * needs to distinguish two overlapping ranges.
 */
export function matchesNumericPredicate(factValue: string, predicate: string): boolean {
  const iv = parseInterval(factValue);
  if (!iv) return false;
  const point = (iv.lo + Math.min(iv.hi, iv.lo + 60)) / 2;
  const m = /^([<>])(\d+(?:\.\d+)?)$/.exec(predicate.trim());
  if (!m) return factValue.trim() === predicate.trim();
  const n = Number(m[2]);
  return m[1] === '<' ? point < n : point > n;
}

function parseInterval(v: string): { lo: number; hi: number } | null {
  const s = v.trim();
  let m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { lo: Number(m[1]), hi: Number(m[1]) };
  m = /^>(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { lo: Number(m[1]) + 1, hi: Infinity };
  m = /^<(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { lo: 0, hi: Math.max(0, Number(m[1]) - 1) };
  m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  return null;
}

const NUMERIC_KEYS: FactKey[] = ['days_since_sanction'];

function weightFor(key: FactKey, table: Weight[] | undefined, value: string): number {
  if (!table) return 0;
  if (NUMERIC_KEYS.includes(key)) {
    let total = 0;
    for (const w of table) if (matchesNumericPredicate(value, w.value)) total += w.weight;
    return total;
  }
  const hit = table.find((w) => w.value === value);
  return hit ? hit.weight : 0;
}

function gateViolated(h: Hypothesis, facts: FactMap): boolean {
  if (!h.requires) return false;
  for (const [key, allowed] of Object.entries(h.requires)) {
    const v = facts[key]?.value;
    if (isUnknown(v)) continue;
    if (!allowed!.includes(v!)) return true;
  }
  return false;
}

export type ScoredHypothesis = {
  hypothesis: Hypothesis;
  raw: number;
  confidence: number;
  matchedSupports: { key: FactKey; value: string; weight: number }[];
};

/** Pure, synchronous, no model anywhere near it. */
export function scoreAll(facts: FactMap): ScoredHypothesis[] {
  const scored = HYPOTHESES.map((h) => {
    if (gateViolated(h, facts)) {
      return { hypothesis: h, raw: 0, confidence: 0, matchedSupports: [] as ScoredHypothesis['matchedSupports'] };
    }
    let l = logit(h.prior);
    const matched: ScoredHypothesis['matchedSupports'] = [];
    for (const [key, entry] of Object.entries(facts)) {
      const k = key as FactKey;
      const v = entry.value;
      if (isUnknown(v)) continue; // absence is never evidence
      const s = weightFor(k, h.supports[k], v);
      if (s) {
        l += s;
        matched.push({ key: k, value: v, weight: s });
      }
      l -= weightFor(k, h.contradicts[k], v);
    }
    return { hypothesis: h, raw: sigmoid(l), confidence: 0, matchedSupports: matched };
  });

  const sum = scored.reduce((s, x) => s + x.raw, 0) || 1;
  for (const s of scored) s.confidence = s.raw / sum;
  scored.sort((a, b) => b.confidence - a.confidence || a.hypothesis.id.localeCompare(b.hypothesis.id));
  return scored;
}

export function bandFor(scored: ScoredHypothesis[]): Band {
  const top = scored[0]?.confidence ?? 0;
  const second = scored[1]?.confidence ?? 0;
  if (top >= 0.65 && top - second >= 0.25) return 'HIGH';
  if (top >= 0.4) return 'MEDIUM';
  return 'LOW';
}

export const BAND_LANGUAGE: Record<Band, string> = {
  HIGH: 'Fairly confident',
  MEDIUM: 'Possible',
  LOW: 'Not enough information yet',
};

export type DiagnosisResult = {
  scored: ScoredHypothesis[];
  band: Band;
  ranked: RankedHypothesis[];
  topHypothesisId: string;
};

/** Human-readable "why" bullets, built only from facts we actually hold. */
export function whyBullets(s: ScoredHypothesis, facts: FactMap): string[] {
  const out: string[] = [];
  for (const m of [...s.matchedSupports].sort((a, b) => b.weight - a.weight).slice(0, 4)) {
    out.push(supportSentence(m.key, m.value));
  }
  if (!out.length) {
    out.push('Nothing you have told us rules this out, so it stays on the list.');
  }
  void facts;
  return out;
}

function supportSentence(key: FactKey, value: string): string {
  const map: Record<string, string> = {
    'dbt_enabled_reported:NO': 'You said the account is not switched on for benefit payments.',
    'payment_system_result:RETURNED': 'The payment record you found says the payment came back.',
    'payment_system_result:PROCESSED': 'The payment record you found says the payment was processed.',
    'payment_system_result:NO_RECORD': 'You found no payment record at all against your application.',
    'payment_system_result:PENDING': 'The payment record you found is still pending.',
    'aadhaar_linked_to_account:NO': 'You said Aadhaar is not linked to the account.',
    'peers_paid:YES': 'Classmates on the same scholarship have been paid, so the scheme is paying out.',
    'peers_paid:NO': 'Nobody in your class has been paid, which points upstream of you.',
    'portal_status_code:SANCTIONED': 'The portal shows a sanction.',
    'portal_status_code:DEFECTIVE': 'The portal marks the application defective.',
    'portal_status_code:INSTITUTE_PENDING': 'The portal shows it waiting with the college.',
    'portal_status_code:STATE_PENDING': 'The portal shows it waiting with the state.',
    'account_status_reported:DORMANT': 'You said the account has not been used for a long time.',
    'account_status_reported:CLOSED': 'You said the account is closed.',
    'account_status_reported:MIN_KYC': 'You said the account has a limited (minimum KYC) status.',
    'name_matches_bank:NO': 'You said the name differs between the application and the bank.',
    'multiple_accounts:YES': 'You have more than one account that could hold the Aadhaar link.',
    'account_changed_since_application:YES': 'You changed accounts after applying.',
    'institute_verified:NO': 'The college has not confirmed their verification.',
    'state_verified:NO': 'The state level has not verified it.',
    'sanction_seen:NO': 'You have not seen a sanction on the portal.',
    'passbook_checked_recently:NO': 'You have not checked the passbook recently.',
  };
  const k = `${key}:${value}`;
  if (map[k]) return map[k];
  if (key === 'days_since_sanction') return `That status has been showing for a while (${value} days).`;
  return `You told us ${key.replace(/_/g, ' ')} is ${value.toLowerCase()}.`;
}

export function diagnose(facts: FactMap): DiagnosisResult {
  const scored = scoreAll(facts);
  const band = bandFor(scored);
  const ranked: RankedHypothesis[] = scored.map((s) => ({
    hypothesisId: s.hypothesis.id,
    label: s.hypothesis.label,
    confidence: Number(s.confidence.toFixed(4)),
    why: whyBullets(s, facts),
    disproveBy: s.hypothesis.disproveBy,
  }));
  return { scored, band, ranked, topHypothesisId: scored[0]!.hypothesis.id };
}
