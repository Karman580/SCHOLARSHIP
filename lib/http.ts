import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, clientKey, type RateGroup } from './ratelimit';
import { log } from './log';

export type ErrorCode =
  | 'VALIDATION_ERROR' | 'CASE_NOT_FOUND' | 'INVALID_STATE' | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_UNSUPPORTED' | 'UPLOAD_UNREADABLE' | 'AI_UNAVAILABLE' | 'RATE_LIMITED' | 'SERVER_ERROR';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  CASE_NOT_FOUND: 404,
  INVALID_STATE: 409,
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_UNSUPPORTED: 415,
  UPLOAD_UNREADABLE: 422,
  AI_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

const RETRYABLE: ErrorCode[] = ['RATE_LIMITED', 'SERVER_ERROR', 'AI_UNAVAILABLE'];

export function fail(code: ErrorCode, message: string, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { error: { code, message, retryable: RETRYABLE.includes(code) } },
    { status: STATUS[code], headers: extraHeaders },
  );
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function guardRate(req: Request, group: RateGroup = 'default'): NextResponse | null {
  const r = checkRateLimit(clientKey(req.headers), group);
  if (r.ok) return null;
  return fail('RATE_LIMITED', 'Too many requests from this network. Wait a minute.', { 'Retry-After': String(r.retryAfter) });
}

export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: fail('VALIDATION_ERROR', 'Body must be JSON.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request.') };
  }
  return { ok: true, data: parsed.data };
}

export function serverError(route: string, err: unknown): NextResponse {
  log('error', { route, event: 'ERROR', message: err instanceof Error ? err.message : 'unknown' });
  return fail('SERVER_ERROR', 'Something broke on our side. Your case is saved.');
}
