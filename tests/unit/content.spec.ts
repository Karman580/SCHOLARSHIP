import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOSING_LINE } from '@/lib/engine/artifacts';
import { fallbackDraft } from '@/lib/ai/fallback';
import { ARTIFACT_TYPES } from '@/lib/types';
import { QUESTION_BANK } from '@/lib/engine/questions';
import { DISCLOSURE_LINE, SYNTHETIC_LINE } from '@/components/Chrome';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** These protect the honesty score. A failure here is a release blocker, not a nit. */
const BANNED = [
  'we checked', 'we verified', 'we confirmed', 'we submitted', 'we filed',
  'your file is at', 'will be credited on', 'guaranteed', 'official government',
];

// Source files that legitimately contain the banned phrases: the validators that
// reject them, and the tests that prove the validators work.
const ALLOWED_FILES = [
  'lib/engine/artifacts.ts',
  'lib/ai/explain.ts',
  'lib/ai/draft.ts',
  'tests/unit/artifact-validators.spec.ts',
  'tests/unit/content.spec.ts',
];

describe('content and honesty', () => {
  it('never uses a prohibited phrase in shipped copy', () => {
    const offenders: string[] = [];
    for (const file of [...walk('app'), ...walk('components'), ...walk('lib')]) {
      if (ALLOWED_FILES.some((a) => file.endsWith(a))) continue;
      // The disclosure line denies being an official government service. Strip it before
      // scanning so the denial is not read as the claim.
      const src = readFileSync(file, 'utf8').toLowerCase().split('not an official government service').join('');
      for (const phrase of BANNED) if (src.includes(phrase)) offenders.push(`${file}: "${phrase}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('puts the disclosure strip in the root layout', () => {
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain('DisclosureStrip');
    expect(DISCLOSURE_LINE).toBe('Independent prototype — not an official government service.');
    expect(SYNTHETIC_LINE).toContain('No live government, banking, Aadhaar, PFMS or NPCI system is connected');
  });

  it('ends every artifact template with the exact closing line', () => {
    const ctx = {
      language: 'en' as const, scheme: 'Post-Matric scholarship', academicYear: '2025-26',
      applicationRef: 'NSP-DEMO-1001', topHypothesisLabel: 'x', band: 'HIGH' as const,
      known: [], alreadyDone: [], rungLabel: 'Bank branch',
    };
    for (const type of ARTIFACT_TYPES) {
      expect(fallbackDraft({ ...ctx, type }).body.trimEnd().endsWith(CLOSING_LINE), type).toBe(true);
    }
  });

  it('badges every how-to-check block as a public rule', () => {
    for (const q of QUESTION_BANK) {
      if (q.howToCheck) expect(q.howToCheck.provenance).toBe('PUBLIC_RULE');
    }
  });

  it('says on /about that no national failure statistic exists', () => {
    const about = readFileSync('app/about/page.tsx', 'utf8');
    expect(about).toMatch(/no verified national statistic/i);
    expect(about).toMatch(/product judgement, not\s*\n?\s*measured frequencies/i);
  });

  it('states what production integration would need', () => {
    const about = readFileSync('app/about/page.tsx', 'utf8');
    expect(about).toMatch(/approved sandbox/i);
    expect(about).toMatch(/verified identity flow/i);
  });

  it('never promises the money will arrive', () => {
    const offenders: string[] = [];
    for (const file of [...walk('app'), ...walk('components')]) {
      const src = readFileSync(file, 'utf8');
      if (/\byou will (get|receive) (your|the) money\b/i.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
