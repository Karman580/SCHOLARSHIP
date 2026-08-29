import { describe, expect, it } from 'vitest';
import { buildJourney } from '@/lib/engine/journey';
import type { FactMap } from '@/lib/engine/facts';

const f = (o: Record<string, string>): FactMap =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, provenance: 'USER_STATED' as const }]));

describe('journey construction', () => {
  it('marks the top hypothesis stage as the only blocked one', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', dbt_enabled_reported: 'NO' }), topHypothesisId: 'H_DBT_NOT_ENABLED', band: 'HIGH' });
    const blocked = j.filter((s) => s.status === 'BLOCKED');
    expect(blocked.map((s) => s.stageId)).toEqual([7]);
  });

  it('marks stages after the blocker as not reached', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES' }), topHypothesisId: 'H_PAYMENT_NOT_INITIATED', band: 'MEDIUM' });
    expect(j.find((s) => s.stageId === 6)!.status).toBe('NOT_REACHED');
    expect(j.find((s) => s.stageId === 8)!.status).toBe('NOT_REACHED');
  });

  it('never confirms a stage without attestation', () => {
    const j = buildJourney({ facts: f({}), topHypothesisId: 'H_DBT_NOT_ENABLED', band: 'MEDIUM' });
    expect(j.filter((s) => s.status === 'CONFIRMED')).toEqual([]);
  });

  it('produces no blocked stage at band LOW', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES' }), topHypothesisId: 'H_DBT_NOT_ENABLED', runnerUpHypothesisId: 'H_ACCOUNT_UNUSABLE', band: 'LOW' });
    expect(j.filter((s) => s.status === 'BLOCKED')).toEqual([]);
    expect(j.find((s) => s.stageId === 7)!.note).toMatch(/one of these two/i);
  });

  it('does not treat a routing-layer bounce as proof that routing worked', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', dbt_enabled_reported: 'NO' }), topHypothesisId: 'H_DBT_NOT_ENABLED', band: 'HIGH' });
    expect(j.find((s) => s.stageId === 7)!.status).toBe('BLOCKED');
    expect(j.find((s) => s.stageId === 6)!.status).toBe('CONFIRMED');
  });

  it('confirms routing when the bounce clearly happened at the account', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES', payment_system_result: 'RETURNED', account_status_reported: 'DORMANT' }), topHypothesisId: 'H_ACCOUNT_UNUSABLE', band: 'MEDIUM' });
    expect(j.find((s) => s.stageId === 7)!.status).toBe('CONFIRMED');
    expect(j.find((s) => s.stageId === 8)!.status).toBe('BLOCKED');
  });

  it('gives every stage a provenance', () => {
    const j = buildJourney({ facts: f({ sanction_seen: 'YES' }), topHypothesisId: 'H_DBT_NOT_ENABLED', band: 'MEDIUM' });
    expect(j).toHaveLength(8);
    for (const s of j) expect(s.provenance).toBeTruthy();
  });
});
