import OpenAI from 'openai';
import { log } from '../log';

/**
 * One provider seam. Gemini and OpenAI are both spoken to over the OpenAI
 * chat-completions wire format, so there is a single call path below rather than
 * one per vendor. The key is read from the environment on every call and is never
 * logged, echoed into an error, or sent to the browser.
 */
export type Provider = { name: 'gemini' | 'openai'; apiKey: string; baseURL?: string; model: string };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';

export function aiProvider(): Provider | null {
  // An explicit off switch. Emptying the key variables does not work: Next treats an
  // empty value as unset and refills it from .env.local, so a test run or an offline
  // deployment needs something a dotenv file cannot silently undo.
  if (process.env.AI_OFFLINE === 'true') return null;

  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (gemini) {
    return {
      name: 'gemini',
      apiKey: gemini,
      baseURL: process.env.GEMINI_BASE_URL?.trim() || GEMINI_BASE,
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
    };
  }
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) {
    return { name: 'openai', apiKey: openai, model: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini' };
  }
  return null;
}

export const AI_ENABLED = (): boolean => aiProvider() !== null;
const TIMEOUT = () => Number(process.env.AI_TIMEOUT_MS ?? process.env.OPENAI_TIMEOUT_MS ?? 12000);

export type InputPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string };

export type CallResult<T> = { ok: true; data: T } | { ok: false; reason: 'DISABLED' | 'TIMEOUT' | 'ERROR' | 'INVALID' };

let cached: { key: string; client: OpenAI } | null = null;
function getClient(p: Provider): OpenAI {
  // The cache key is the connection, not the secret: a rotated key rebuilds the client.
  const key = `${p.baseURL ?? 'default'}|${p.apiKey.length}|${p.apiKey.slice(-4)}`;
  if (!cached || cached.key !== key) cached = { key, client: new OpenAI({ apiKey: p.apiKey, baseURL: p.baseURL, maxRetries: 0 }) };
  return cached.client;
}

/** Responses-API part shapes in, chat-completions part shapes out. */
function toMessageContent(parts: InputPart[]) {
  return parts.map((p) =>
    p.type === 'input_text'
      ? ({ type: 'text', text: p.text } as const)
      : ({ type: 'image_url', image_url: { url: p.image_url } } as const),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The only place the model is called. Never throws to a route: every non-ok result
 * routes the caller to lib/ai/fallback.ts. Prompt and completion content is never logged.
 */
export async function callStructured<T>(args: {
  schemaName: string;
  jsonSchema: object;
  system: string;
  input: InputPart[];
  parse: (raw: unknown) => T | null;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<CallResult<T>> {
  const provider = aiProvider();
  if (!provider) return { ok: false, reason: 'DISABLED' };
  const started = Date.now();
  const timeout = args.timeoutMs ?? TIMEOUT();

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await getClient(provider).chat.completions.create(
        {
          model: provider.model,
          temperature: args.temperature ?? 0,
          // Gemini 2.5 spends output tokens on thinking before it writes anything, so a
          // budget sized for the answer alone comes back truncated and unparseable.
          // We want wording, not reasoning: turn thinking off and keep the caller's budget.
          ...(provider.name === 'gemini' ? { reasoning_effort: 'none' } : {}),
          max_tokens: args.maxOutputTokens ?? 900,
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: toMessageContent(args.input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: args.schemaName,
              schema: args.jsonSchema as Record<string, unknown>,
              // Gemini's OpenAI-compatible layer has no strict mode; asking for it 400s.
              ...(provider.name === 'openai' ? { strict: true } : {}),
            },
          },
        } as never,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      const text = (res as { choices?: { message?: { content?: string | null } }[] }).choices?.[0]?.message?.content ?? '';
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        log('warn', { event: 'AI_INVALID', schema: args.schemaName, durationMs: Date.now() - started });
        return { ok: false, reason: 'INVALID' };
      }
      const parsed = args.parse(raw);
      if (parsed === null) {
        log('warn', { event: 'AI_INVALID', schema: args.schemaName, durationMs: Date.now() - started });
        return { ok: false, reason: 'INVALID' };
      }
      log('info', { event: 'AI_OK', schema: args.schemaName, durationMs: Date.now() - started });
      return { ok: true, data: parsed };
    } catch (err) {
      clearTimeout(timer);
      const e = err as { status?: number; name?: string };
      if (e.name === 'AbortError') {
        log('warn', { event: 'AI_TIMEOUT', schema: args.schemaName, durationMs: Date.now() - started });
        return { ok: false, reason: 'TIMEOUT' }; // no retry on timeout
      }
      const retryable = e.status === 429 || (typeof e.status === 'number' && e.status >= 500);
      if (retryable && attempt === 0) {
        await sleep(800 + Math.random() * 400);
        continue;
      }
      // Only the status code is logged. A provider error body can echo the request, so it never reaches the log.
      log('warn', { event: 'AI_ERROR', schema: args.schemaName, status: e.status ?? null, durationMs: Date.now() - started });
      return { ok: false, reason: 'ERROR' };
    }
  }
  return { ok: false, reason: 'ERROR' };
}
