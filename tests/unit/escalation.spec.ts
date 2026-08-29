import { describe, expect, it } from 'vitest';
import { BANK_LADDER, ladderFor, nextRung, rungById, SCHEME_LADDER } from '@/lib/engine/escalation';
import { HYPOTHESES } from '@/lib/engine/hypotheses';

describe('escalation ladder', () => {
  it('routes bank-side causes to the bank ladder', () => {
    expect(ladderFor('H_DBT_NOT_ENABLED')).toBe(BANK_LADDER);
    expect(ladderFor('H_ACCOUNT_UNUSABLE')).toBe(BANK_LADDER);
    expect(ladderFor('H_NAME_MISMATCH')).toBe(BANK_LADDER);
  });

  it('routes scheme-side causes to the scheme ladder', () => {
    expect(ladderFor('H_PAYMENT_NOT_INITIATED')).toBe(SCHEME_LADDER);
    expect(ladderFor('H_INSTITUTE_PENDING')).toBe(SCHEME_LADDER);
  });

  it('advances one rung at a time and then stops', () => {
    let current: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = nextRung('H_PAYMENT_NOT_INITIATED', current);
      if (!r) break;
      seen.push(r.id);
      current = r.id;
    }
    expect(seen).toEqual(SCHEME_LADDER.map((r) => r.id));
    expect(nextRung('H_PAYMENT_NOT_INITIATED', 'RTI')).toBeNull();
  });

  it('gives every rung an artifact, a wait period and a public-rule note', () => {
    for (const r of [...SCHEME_LADDER, ...BANK_LADDER]) {
      expect(r.artifactType).toBeTruthy();
      expect(r.waitDays).toBeGreaterThan(0);
      expect(r.publicRuleNote.length).toBeGreaterThan(20);
      expect(rungById(r.id)).toEqual(r);
    }
  });

  it('never states a legal deadline as verified for a specific scheme', () => {
    for (const r of [...SCHEME_LADDER, ...BANK_LADDER]) {
      expect(r.publicRuleNote).not.toMatch(/\bmust (respond|reply) within\b/i);
      expect(r.publicRuleNote).not.toMatch(/\blegally required\b/i);
    }
  });

  it('has a ladder for every hypothesis', () => {
    for (const h of HYPOTHESES) expect(ladderFor(h.id).length).toBeGreaterThan(0);
  });
});
