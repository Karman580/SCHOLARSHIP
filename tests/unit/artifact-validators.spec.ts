import { describe, expect, it } from 'vitest';
import { CLOSING_LINE, extractPlaceholders, PROHIBITED_PATTERNS, validateArtifactBody } from '@/lib/engine/artifacts';
import { fallbackDraft } from '@/lib/ai/fallback';
import { ARTIFACT_TYPES } from '@/lib/types';

const good = `To the Branch Manager,\n\nPlease enable my account.\n\n${CLOSING_LINE}`;

describe('artifact validation', () => {
  it('accepts a clean body', () => {
    expect(validateArtifactBody(good, [])).toEqual({ ok: true });
  });

  it('rejects a body missing the closing line', () => {
    expect(validateArtifactBody('Please enable my account.', [])).toEqual({ ok: false, reason: 'Missing the exact closing line.' });
  });

  it('rejects an invented long digit sequence', () => {
    const body = `My account is ${'1234567890' + '123'}.\n\n${CLOSING_LINE}`;
    expect(validateArtifactBody(body, []).ok).toBe(false);
  });

  it('rejects every prohibited claim', () => {
    const claims = [
      'We have checked PFMS for you.',
      'Bank records show the payment failed.',
      'Your file is at Directorate office.',
      'The amount will be credited on Monday.',
      'We have submitted your grievance.',
      'This is officially verified.',
      'Payment is guaranteed.',
    ];
    for (const claim of claims) {
      const res = validateArtifactBody(`${claim}\n\n${CLOSING_LINE}`, []);
      expect(res.ok, claim).toBe(false);
    }
  });

  it('rejects more than six unfilled placeholders', () => {
    const body = `${Array.from({ length: 7 }, (_, i) => `[[field ${i}]]`).join(' ')}\n\n${CLOSING_LINE}`;
    expect(validateArtifactBody(body, extractPlaceholders(body)).ok).toBe(false);
  });

  it('ignores digits inside a placeholder', () => {
    expect(validateArtifactBody(`Account: [[your account number]]\n\n${CLOSING_LINE}`, ['your account number'])).toEqual({ ok: true });
  });

  it('has at least one pattern for each documented prohibition', () => {
    expect(PROHIBITED_PATTERNS.length).toBeGreaterThanOrEqual(7);
  });
});

describe('template artifacts', () => {
  const ctx = {
    language: 'en' as const, scheme: 'Post-Matric scholarship', academicYear: '2025-26',
    applicationRef: 'NSP-DEMO-1001', topHypothesisLabel: 'the account is not enabled',
    band: 'HIGH' as const, known: ['Portal status: Sanctioned'], alreadyDone: ['Checked the passbook'],
    rungLabel: 'Bank branch',
  };

  for (const type of ARTIFACT_TYPES) {
    it(`${type} passes its own validator in English`, () => {
      const d = fallbackDraft({ ...ctx, type });
      expect(validateArtifactBody(d.body, extractPlaceholders(d.body))).toEqual({ ok: true });
      expect(d.body.trimEnd().endsWith(CLOSING_LINE)).toBe(true);
    });
  }

  for (const type of ARTIFACT_TYPES.filter((t) => t !== 'CASE_SUMMARY')) {
    it(`${type} passes its own validator in Hindi`, () => {
      const d = fallbackDraft({ ...ctx, type, language: 'hi' });
      expect(validateArtifactBody(d.body, extractPlaceholders(d.body))).toEqual({ ok: true });
      expect(d.body).toMatch(/[ऀ-ॿ]/);
    });
  }
});
