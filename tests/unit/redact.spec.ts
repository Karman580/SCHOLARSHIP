import { describe, expect, it } from 'vitest';
import { redact } from '@/lib/redact';

// Shape fixtures are assembled at runtime: no 12-digit literal exists in this repo,
// in source, seed data, fixtures or tests. See scripts/check-boundaries.ts.
const twelve = '1234' + '5678' + '9012';
const eleven = '1234' + '5678' + '901';
const eighteen = twelve + '345678';

describe('redact', () => {
  it('removes Aadhaar-shaped 12-digit runs, spaced or not', () => {
    expect(redact(`my number is ${twelve.replace(/(....)(....)(....)/, '$1 $2 $3')} ok`)).toBe('my number is [removed] ok');
    expect(redact(twelve.replace(/(....)(....)(....)/, '$1-$2-$3'))).toBe('[removed]');
    expect(redact(`a ${twelve} b`)).toBe('a [removed] b');
  });

  it('removes account-shaped runs of 9 and 11 to 18 digits', () => {
    expect(redact('acct 123456789')).toBe('acct [removed]');
    expect(redact(`acct ${eleven}`)).toBe('acct [removed]');
    expect(redact(`acct ${eighteen}`)).toBe('acct [removed]');
  });

  it('preserves a 10-digit phone number — it is not an identifier we block', () => {
    expect(redact('call me on 9876543210')).toBe('call me on 9876543210');
  });

  it('removes an OTP adjacent to the word OTP, on either side', () => {
    expect(redact('OTP is 483920')).toContain('[removed]');
    expect(redact('483920 is the OTP')).toContain('[removed]');
  });

  it('removes PAN-shaped strings', () => {
    expect(redact('PAN ABCDE1234F here')).toBe('PAN [removed] here');
  });

  it('leaves ordinary amounts and years alone', () => {
    expect(redact('₹23,000 sanctioned in 2025-26')).toBe('₹23,000 sanctioned in 2025-26');
  });

  it('handles empty input', () => {
    expect(redact('')).toBe('');
    expect(redact(null)).toBe('');
  });
});
