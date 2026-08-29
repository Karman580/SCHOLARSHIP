import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, clientKey, resetRateLimits } from '@/lib/ratelimit';

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows the configured burst then returns a retry-after', () => {
    const limit = Number(process.env.RATE_LIMIT_PER_MIN ?? 30);
    for (let i = 0; i < limit; i++) expect(checkRateLimit('1.2.3.4').ok, `request ${i}`).toBe(true);
    const blocked = checkRateLimit('1.2.3.4');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('holds model routes to a tighter budget', () => {
    for (let i = 0; i < 6; i++) expect(checkRateLimit('5.6.7.8', 'model').ok).toBe(true);
    expect(checkRateLimit('5.6.7.8', 'model').ok).toBe(false);
    // The default group is unaffected by the model group's budget.
    expect(checkRateLimit('5.6.7.8').ok).toBe(true);
  });

  it('keys on the first hop of x-forwarded-for', () => {
    expect(clientKey(new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
    expect(clientKey(new Headers())).toBe('local');
  });
});
