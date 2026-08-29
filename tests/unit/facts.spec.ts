import { describe, expect, it } from 'vitest';
import { mergeFacts, normaliseFactValue, isFactKey, toFactMap, factValueLabel } from '@/lib/engine/facts';
import type { Fact } from '@/lib/types';

const existing = (key: string, value: string, provenance: Fact['provenance']): Fact => ({
  id: key, caseId: 'c', key, value, provenance, confidence: null, quote: null, createdAt: new Date().toISOString(),
});

describe('facts', () => {
  it('never lets a model inference overwrite what the student stated', () => {
    const merged = mergeFacts([existing('credit_seen', 'NO', 'USER_STATED')], [
      { key: 'credit_seen', value: 'YES', provenance: 'AI_INFERENCE' },
    ]);
    expect(merged).toEqual([]);
  });

  it('lets the student overwrite a model inference', () => {
    const merged = mergeFacts([existing('credit_seen', 'YES', 'AI_INFERENCE')], [
      { key: 'credit_seen', value: 'NO', provenance: 'USER_STATED' },
    ]);
    expect(merged).toEqual([{ key: 'credit_seen', value: 'NO', provenance: 'USER_STATED' }]);
  });

  it('never downgrades a known value to UNKNOWN', () => {
    const merged = mergeFacts([existing('credit_seen', 'NO', 'AI_INFERENCE')], [
      { key: 'credit_seen', value: 'UNKNOWN', provenance: 'USER_STATED' },
    ]);
    expect(merged).toEqual([]);
  });

  it('drops keys outside the closed set', () => {
    expect(mergeFacts([], [{ key: 'favourite_colour', value: 'blue', provenance: 'AI_INFERENCE' }])).toEqual([]);
    expect(isFactKey('favourite_colour')).toBe(false);
  });

  it('drops values outside a key allowed set', () => {
    expect(normaliseFactValue('credit_seen', 'probably')).toBeNull();
    expect(normaliseFactValue('credit_seen', 'yes')).toBe('YES');
    expect(mergeFacts([], [{ key: 'credit_seen', value: 'probably', provenance: 'AI_INFERENCE' }])).toEqual([]);
  });

  it('keeps free-text keys as text', () => {
    expect(normaliseFactValue('portal_status_raw', 'SANCTIONED — under process')).toBe('SANCTIONED — under process');
  });

  it('reads back the latest value only', () => {
    const map = toFactMap([existing('credit_seen', 'NO', 'USER_STATED')]);
    expect(map.credit_seen?.value).toBe('NO');
  });

  it('renders values in plain words', () => {
    expect(factValueLabel('credit_seen', 'NO')).toBe('No');
    expect(factValueLabel('days_since_sanction', '>60')).toBe('More than 60 days');
    expect(factValueLabel('account_status_reported', 'DORMANT')).toBe('Not used for a long time');
  });
});
