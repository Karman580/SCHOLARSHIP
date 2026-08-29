export const REDACTED = '[removed]';

/**
 * Runs on EVERY text write path: free text, pasted status, screenshot text, answers,
 * notes, artifact edits (safety-and-honesty.md §5).
 *
 * A plain 10-digit run is deliberately preserved — it is most likely a phone number,
 * which a student may legitimately need in a letter placeholder.
 */
export function redact(input: string | null | undefined): string {
  if (!input) return '';
  let out = input;

  // PAN-shaped
  out = out.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, REDACTED);

  // "OTP" adjacent 4-6 digit code
  out = out.replace(/\b(otp|o\.t\.p\.?)\b([^0-9\n]{0,16})\d{4,6}\b/gi, (_m, w, gap) => `${w}${gap}${REDACTED}`);
  out = out.replace(/\b\d{4,6}\b([^0-9\n]{0,16})\b(otp|o\.t\.p\.?)\b/gi, (_m, gap, w) => `${REDACTED}${gap}${w}`);

  // Aadhaar-shaped: 12 digits written in groups with spaces or hyphens
  out = out.replace(/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g, REDACTED);

  // Account-shaped: 9-18 digit runs. Exactly 10 digits is left alone (phone number).
  out = out.replace(/\b\d{9,18}\b/g, (m) => (m.length === 10 ? m : REDACTED));

  return out;
}

export function redactedSomething(original: string, cleaned: string): boolean {
  return cleaned.includes(REDACTED) && !original.includes(REDACTED);
}
