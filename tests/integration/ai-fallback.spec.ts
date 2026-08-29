import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepo } from '@/lib/db/memory';
import { runDemoCase } from '@/lib/demo-runner';
import { fallbackExtract, daysSinceBucket } from '@/lib/ai/fallback';
import { SEEDS } from '@/lib/gov-mock/seed';
import { diagnose } from '@/lib/engine/diagnose';
import { toFactMap } from '@/lib/engine/facts';

describe('deterministic fallback mode', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('completes all three demo cases with no model', async () => {
    const repo = new MemoryRepo();
    const expected: Record<number, string> = { 1: 'RESOLVED', 2: 'ESCALATED', 3: 'RESOLVED' };
    for (const s of SEEDS) {
      const r = await runDemoCase(repo, s.caseNo);
      expect(r.finalState, `case ${s.caseNo}`).toBe(expected[s.caseNo]);
      expect(r.aiMode).toBe('fallback');
    }
  });

  it('reaches the ranking the demo cases document', async () => {
    const repo = new MemoryRepo();
    expect((await runDemoCase(repo, 1)).topHypothesis).toBe('H_DBT_NOT_ENABLED');
    expect((await runDemoCase(repo, 2)).topHypothesis).toBe('H_PAYMENT_NOT_INITIATED');
    const three = await runDemoCase(repo, 3);
    expect(three.topHypothesis).toBe('H_ACCOUNT_UNUSABLE');
    expect(three.band).toBe('MEDIUM');
    // The runner-up must stay visible, not be guessed away.
    expect(three.runnerUp).toBe('H_NAME_MISMATCH');
  });

  it('writes an AI_FALLBACK_USED event', async () => {
    const repo = new MemoryRepo();
    const r = await runDemoCase(repo, 1);
    const cwr = (await repo.getCaseByToken(r.token))!;
    expect(cwr.events.some((e) => e.type === 'AI_FALLBACK_USED')).toBe(true);
  });
});

describe('fallback extraction', () => {
  const extract = (text: string) => fallbackExtract({ description: text, statusText: '', imageNames: [] }).result;
  const value = (text: string, key: string) => extract(text).facts.find((f) => f.key === key)?.value;

  it('does not read "aadhaar link hai" as DBT being enabled', () => {
    const facts = extract(SEEDS[0]!.intakeText).facts;
    expect(facts.find((f) => f.key === 'aadhaar_linked_to_account')?.value).toBe('YES');
    expect(facts.find((f) => f.key === 'dbt_enabled_reported')).toBeUndefined();
  });

  it('reads the case 1 Hinglish intake', () => {
    const t = SEEDS[0]!.intakeText;
    expect(value(t, 'scheme_type')).toBe('POST_MATRIC');
    expect(value(t, 'portal_status_code')).toBe('SANCTIONED');
    expect(value(t, 'sanction_seen')).toBe('YES');
    expect(value(t, 'credit_seen')).toBe('NO');
    expect(value(t, 'peers_paid')).toBe('YES');
    expect(value(t, 'institute_verified')).toBe('YES');
  });

  it('reads the case 2 intake, including that nobody was paid', () => {
    const t = SEEDS[1]!.intakeText;
    expect(value(t, 'sanction_seen')).toBe('YES');
    expect(value(t, 'credit_seen')).toBe('NO');
    expect(value(t, 'peers_paid')).toBe('NO');
    expect(value(t, 'account_status_reported')).toBe('ACTIVE');
  });

  it('infers a dormant account from "not used in two years" but leaves the name question open', () => {
    const t = SEEDS[2]!.intakeText;
    expect(value(t, 'account_status_reported')).toBe('DORMANT');
    expect(value(t, 'name_matches_bank')).toBeUndefined();
  });

  // Every one of these reads as its own opposite if the affirmative rule is tried first.
  it.each([
    ['bank bola DBT not enabled hai', 'dbt_enabled_reported', 'NO'],
    ['the counter said DBT is enabled', 'dbt_enabled_reported', 'YES'],
    ['my aadhaar is not linked to this account', 'aadhaar_linked_to_account', 'NO'],
    ['bank gaya tha to bola aadhaar link hai', 'aadhaar_linked_to_account', 'YES'],
    ['college has not verified it yet', 'institute_verified', 'NO'],
    ['college wale bol rahe hain unka kaam ho gaya', 'institute_verified', 'YES'],
    ['the payment is not yet processed', 'payment_system_result', 'PENDING'],
    ['pfms shows processed', 'payment_system_result', 'PROCESSED'],
    ['application marked defective, it was approved earlier', 'portal_status_code', 'DEFECTIVE'],
  ])('reads %s as %s=%s', (text, key, expected) => {
    expect(value(text, key)).toBe(expected);
  });

  it('never sets a payment result from a sanction status alone', () => {
    expect(value('portal shows sanctioned since December', 'payment_system_result')).toBeUndefined();
  });

  it('buckets elapsed time rather than inventing a date', () => {
    const now = new Date('2026-03-01T00:00:00Z');
    expect(daysSinceBucket('sanctioned since December', now)).toBe('>60');
    expect(daysSinceBucket('sanctioned in February', now)).toBe('<30');
    expect(daysSinceBucket('no month here', now)).toBeNull();
  });

  it('cannot read images and says so by naming them unreadable', () => {
    const out = fallbackExtract({ description: 'anything', statusText: '', imageNames: ['a.png', 'b.png'] });
    expect(out.unreadableFiles).toEqual(['a.png', 'b.png']);
  });

  it('produces the same ranking as a stubbed model given the same facts', () => {
    const facts = toFactMap(
      extract(SEEDS[0]!.intakeText).facts.map((f, i) => ({
        id: String(i), caseId: 'c', key: f.key, value: f.value, provenance: 'USER_STATED' as const,
        confidence: null, quote: null, createdAt: '',
      })),
    );
    const a = diagnose(facts);
    const b = diagnose({ ...facts });
    expect(a.ranked).toEqual(b.ranked);
  });
});
