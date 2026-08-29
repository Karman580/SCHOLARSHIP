import { describe, expect, it } from 'vitest';
import {
  expectedGain, factsFromAnswer, isValidAnswer, MAX_QUESTIONS, MIN_GAIN,
  QUESTION_BANK, rankCandidates, selectNext,
} from '@/lib/engine/questions';
import type { FactMap } from '@/lib/engine/facts';

const f = (o: Record<string, string>): FactMap =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, provenance: 'USER_STATED' as const }]));

describe('question selection', () => {
  it('picks the highest information gain first', () => {
    const ranked = rankCandidates(f({ sanction_seen: 'YES' }), []);
    expect(ranked.length).toBeGreaterThan(1);
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.gain).toBeGreaterThanOrEqual(ranked[i]!.gain);
  });

  it('never repeats a question already asked', () => {
    const asked = ['Q_PFMS_LOOKUP', 'Q_DBT_STATUS'];
    const ids = rankCandidates(f({}), asked).map((c) => c.question.id);
    for (const a of asked) expect(ids).not.toContain(a);
  });

  it('stops once the band is HIGH', () => {
    const facts = f({ sanction_seen: 'YES', portal_status_code: 'SANCTIONED', payment_system_result: 'RETURNED', dbt_enabled_reported: 'NO', peers_paid: 'YES' });
    expect(selectNext(facts, { askedIds: [], consecutiveSkips: 0 })).toEqual({ done: true, reason: 'BAND_HIGH' });
  });

  it('stops after five questions', () => {
    const asked = QUESTION_BANK.slice(0, MAX_QUESTIONS).map((q) => q.id);
    expect(selectNext(f({}), { askedIds: asked, consecutiveSkips: 0 })).toEqual({ done: true, reason: 'MAX_QUESTIONS' });
  });

  it('stops after three skips in a row', () => {
    expect(selectNext(f({}), { askedIds: [], consecutiveSkips: 3 })).toEqual({ done: true, reason: 'SKIPPED_OUT' });
  });

  it('stops when every question has already been answered by the facts', () => {
    const allResolved: Record<string, string> = {};
    for (const q of QUESTION_BANK) for (const k of q.resolves) allResolved[k] = k === 'days_since_sanction' ? '>60' : 'NO';
    const sel = selectNext(f(allResolved), { askedIds: [], consecutiveSkips: 0 });
    expect(sel).toEqual({ done: true, reason: 'EXHAUSTED' });
  });

  it('offers at most three candidates', () => {
    const sel = selectNext(f({}), { askedIds: [], consecutiveSkips: 0 });
    expect(sel.done).toBe(false);
    if (!sel.done) expect(sel.candidates.length).toBeLessThanOrEqual(3);
  });

  it("writes nothing for I don't know or skip", () => {
    expect(factsFromAnswer('Q_PFMS_LOOKUP', 'DONT_KNOW')).toEqual({});
    expect(factsFromAnswer('Q_PFMS_LOOKUP', 'SKIPPED')).toEqual({});
    expect(factsFromAnswer('Q_PFMS_LOOKUP', 'RETURNED')).toEqual({ payment_system_result: 'RETURNED' });
  });

  it('rejects an answer we never offered', () => {
    expect(isValidAnswer('Q_PFMS_LOOKUP', 'RETURNED')).toBe(true);
    expect(isValidAnswer('Q_PFMS_LOOKUP', 'MAYBE')).toBe(false);
    expect(isValidAnswer('Q_NOT_A_QUESTION', 'RETURNED')).toBe(false);
  });

  it('gains nothing from a question whose facts are already known', () => {
    const facts = f({ payment_system_result: 'RETURNED' });
    const q = QUESTION_BANK.find((x) => x.id === 'Q_PFMS_LOOKUP')!;
    expect(expectedGain(q, facts)).toBeLessThan(MIN_GAIN + 1);
    expect(rankCandidates(facts, []).map((c) => c.question.id)).not.toContain('Q_PFMS_LOOKUP');
  });

  it('gives every question a why and 2 to 4 options', () => {
    for (const q of QUESTION_BANK) {
      expect(q.why.length).toBeGreaterThan(10);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
    }
  });
});
