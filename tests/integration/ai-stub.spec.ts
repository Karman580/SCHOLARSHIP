import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extract } from '@/lib/ai/extract';
import { explain } from '@/lib/ai/explain';
import { draft } from '@/lib/ai/draft';
import { CLOSING_LINE, validateArtifactBody, extractPlaceholders } from '@/lib/engine/artifacts';
import * as client from '@/lib/ai/client';

const ranked = [
  { hypothesisId: 'H_DBT_NOT_ENABLED', label: 'not enabled', confidence: 0.8, why: ['a', 'b'], disproveBy: ['x'] },
  { hypothesisId: 'H_ACCOUNT_UNUSABLE', label: 'unusable', confidence: 0.1, why: ['c'], disproveBy: ['y'] },
];
const unknown = [{ id: 'dbt_enabled_reported', text: 'u', howToFindOut: 'ask at the counter' }];

const draftCtx = {
  type: 'BANK_DBT_REQUEST' as const, language: 'en' as const, scheme: 'Post-Matric scholarship',
  academicYear: '2025-26', applicationRef: 'NSP-DEMO-1001', topHypothesisLabel: 'not enabled',
  band: 'HIGH' as const, known: [], alreadyDone: [], rungLabel: 'Bank branch',
};

/** Every one of these must fall back cleanly. None may throw. */
describe('model failure modes', () => {
  beforeEach(() => { process.env.OPENAI_API_KEY = 'test-key-not-used'; });
  afterEach(() => { vi.restoreAllMocks(); delete process.env.OPENAI_API_KEY; });

  const failures = ['INVALID', 'TIMEOUT', 'ERROR', 'DISABLED'] as const;

  for (const reason of failures) {
    it(`falls back on ${reason}`, async () => {
      vi.spyOn(client, 'callStructured').mockResolvedValue({ ok: false, reason });
      const e = await extract({ description: 'sanctioned since December, no money', statusText: '', images: [] });
      expect(e.mode).toBe('fallback');
      const x = await explain({ band: 'HIGH', ranked, known: [], unknown, journey: [], language: 'en' });
      expect(x.mode).toBe('fallback');
      const d = await draft(draftCtx);
      expect(d.mode).toBe('template');
    });
  }

  it('drops an unknown fact key the model returns', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true,
      data: {
        facts: [
          { key: 'credit_seen', value: 'NO', source: 'STUDENT_TEXT', confidence: 0.9, quote: 'no money' },
          { key: 'favourite_colour', value: 'blue', source: 'STUDENT_TEXT', confidence: 0.9, quote: '' },
          { key: 'credit_seen', value: 'PROBABLY', source: 'STUDENT_TEXT', confidence: 0.9, quote: '' },
        ],
        restatement: 'r', uninterpreted: [], screenshotText: [],
      } as never,
    });
    const out = await extract({ description: 'x', statusText: '', images: [] });
    expect(out.mode).toBe('model');
    expect(out.facts.map((f) => f.key)).toEqual(['credit_seen']);
    expect(out.facts[0]!.value).toBe('NO');
  });

  it('rejects a verdict containing a prohibited claim and uses the template instead', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true,
      data: { verdictText: 'We have checked PFMS and your money will be credited on Monday.', why: ['a', 'b'], unknownExplained: [] } as never,
    });
    const x = await explain({ band: 'HIGH', ranked, known: [], unknown, journey: [], language: 'en' });
    expect(x.mode).toBe('fallback');
    expect(x.verdictText).not.toMatch(/credited on/i);
  });

  it('rejects a draft that omits the closing line', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true,
      data: { recipient: 'The Branch Manager', subject: 's', body: 'Please enable my account.', placeholders: [] } as never,
    });
    const d = await draft(draftCtx);
    expect(d.mode).toBe('template');
    expect(d.body.trimEnd().endsWith(CLOSING_LINE)).toBe(true);
  });

  it('rejects a draft that invents a long number', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true,
      data: {
        recipient: 'The Branch Manager', subject: 's',
        body: `My account number is ${'1234' + '567890123'}.\n\n${CLOSING_LINE}`, placeholders: [],
      } as never,
    });
    expect((await draft(draftCtx)).mode).toBe('template');
  });

  it('keeps a clean model draft', async () => {
    const body = `To the Branch Manager,\n\nPlease enable [[your account number]] for benefit transfers.\n\n${CLOSING_LINE}`;
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true, data: { recipient: 'The Branch Manager', subject: 's', body, placeholders: ['your account number'] } as never,
    });
    const d = await draft(draftCtx);
    expect(d.mode).toBe('model');
    expect(validateArtifactBody(d.body, extractPlaceholders(d.body))).toEqual({ ok: true });
  });

  it('never lets the model change the ranking', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true,
      data: { verdictText: 'The account is not enabled for benefit payments.', why: ['a', 'b'], unknownExplained: [{ id: 'dbt_enabled_reported', text: 'why it matters' }] } as never,
    });
    const x = await explain({ band: 'HIGH', ranked, known: [], unknown, journey: [], language: 'en' });
    expect(x.mode).toBe('model');
    // The explanation carries no field that could reorder anything.
    expect(Object.keys(x).sort()).toEqual(['mode', 'unknownExplained', 'verdictText', 'why']);
  });

  it('keeps the engine how-to-find-out when the model omits an unknown', async () => {
    vi.spyOn(client, 'callStructured').mockResolvedValue({
      ok: true, data: { verdictText: 'Plain sentence.', why: ['a', 'b'], unknownExplained: [] } as never,
    });
    const x = await explain({ band: 'HIGH', ranked, known: [], unknown, journey: [], language: 'en' });
    expect(x.unknownExplained).toEqual([{ id: 'dbt_enabled_reported', text: 'ask at the counter' }]);
  });
});
