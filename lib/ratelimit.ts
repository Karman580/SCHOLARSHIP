import { log } from './log';

type Bucket = { tokens: number; last: number };

// ponytail: in-process token bucket. Fine for a single-instance prototype; a shared
// store (Redis/Upstash) is the upgrade path if this ever runs on more than one node.
// The limitation is stated on /about.
// Kept on globalThis because Next bundles each route separately — a per-bundle map
// would mean a limiter that never actually limits.
const BUCKETS_KEY = Symbol.for('saathi.ratelimit');
type BucketGlobal = typeof globalThis & { [BUCKETS_KEY]?: Map<string, Bucket> };
const buckets = ((globalThis as BucketGlobal)[BUCKETS_KEY] ??= new Map<string, Bucket>());

const DEFAULT_PER_MIN = () => Number(process.env.RATE_LIMIT_PER_MIN ?? 30);
const MODEL_ROUTE_PER_MIN = () => Number(process.env.MODEL_RATE_LIMIT_PER_MIN ?? 6);

export type RateGroup = 'default' | 'model';

export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0]!.trim() : headers.get('x-real-ip')) || 'local';
}

export function checkRateLimit(
  key: string,
  group: RateGroup = 'default',
): { ok: true } | { ok: false; retryAfter: number } {
  const limit = group === 'model' ? MODEL_ROUTE_PER_MIN() : DEFAULT_PER_MIN();
  if (limit <= 0) return { ok: true };
  const id = `${group}:${key}`;
  const now = Date.now();
  const b = buckets.get(id) ?? { tokens: limit, last: now };
  const refill = ((now - b.last) / 60_000) * limit;
  b.tokens = Math.min(limit, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(id, b);
    const retryAfter = Math.max(1, Math.ceil(((1 - b.tokens) / limit) * 60));
    log('warn', { event: 'RATE_LIMITED', group });
    return { ok: false, retryAfter };
  }
  b.tokens -= 1;
  buckets.set(id, b);
  return { ok: true };
}

/** Test seam only. */
export function resetRateLimits(): void {
  buckets.clear();
}
