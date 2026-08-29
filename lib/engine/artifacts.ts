import type { ArtifactType } from '../types';

export const CLOSING_LINE = 'Prepared with Scholarship Saathi, an independent prototype.';

export const ARTIFACT_META: Record<ArtifactType, { label: string; recipient: string; wordLimit: number }> = {
  BANK_DBT_REQUEST: { label: 'Request to your bank', recipient: 'The Branch Manager', wordLimit: 220 },
  BANK_REACTIVATION_REQUEST: { label: 'Account reactivation request', recipient: 'The Branch Manager', wordLimit: 220 },
  INSTITUTE_FOLLOWUP: { label: 'Follow-up to your college', recipient: 'The Nodal Officer, Scholarship Cell', wordLimit: 220 },
  PORTAL_GRIEVANCE: { label: 'Portal grievance text', recipient: 'The Scheme Helpdesk', wordLimit: 150 },
  RTI_DRAFT: { label: 'RTI request draft', recipient: 'The Public Information Officer, State Nodal Department', wordLimit: 250 },
  CASE_SUMMARY: { label: 'Case summary', recipient: 'You', wordLimit: 900 },
};

/** Patterns the product must never produce. See safety-and-honesty.md §2. */
export const PROHIBITED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bwe (have )?(checked|verified|confirmed)\b/i, reason: 'We checked nothing.' },
  { pattern: /\b(PFMS|NPCI|Aadhaar|bank) (records? )?(show|shows|confirm|confirms)\b/i, reason: 'We cannot read those systems.' },
  { pattern: /\b[Yy]our (file|application) is (at|with) [A-Z]/, reason: 'We cannot see inside any office.' },
  { pattern: /\bwill be credited (on|by)\b/i, reason: 'No date promises, ever.' },
  { pattern: /\bwe (have )?(submitted|filed|lodged)\b/i, reason: 'The student sends everything themselves.' },
  { pattern: /\bofficially verified\b/i, reason: 'We are not official.' },
  { pattern: /\bguaranteed\b/i, reason: 'Nothing here is guaranteed.' },
];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateArtifactBody(body: string, placeholders: string[]): ValidationResult {
  if (!body.trimEnd().endsWith(CLOSING_LINE)) {
    return { ok: false, reason: 'Missing the exact closing line.' };
  }
  // No invented account- or Aadhaar-shaped numbers.
  const digits = body.replace(/\[\[[^\]]*\]\]/g, '');
  if (/\d{9,}/.test(digits.replace(/[\s-]/g, ''))) {
    return { ok: false, reason: 'Contains a long digit sequence.' };
  }
  for (const { pattern, reason } of PROHIBITED_PATTERNS) {
    if (pattern.test(body)) return { ok: false, reason };
  }
  if (placeholders.length > 6) return { ok: false, reason: 'Too many unfilled placeholders.' };
  const found = body.match(/\[\[[^\]]+\]\]/g) ?? [];
  if (found.length > 6) return { ok: false, reason: 'Too many unfilled placeholders in the body.' };
  return { ok: true };
}

export function extractPlaceholders(body: string): string[] {
  const found = body.match(/\[\[([^\]]+)\]\]/g) ?? [];
  return [...new Set(found.map((f) => f.slice(2, -2).trim()))];
}
