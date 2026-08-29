import { afterEach, describe, expect, it } from 'vitest';
import { AI_ENABLED, aiProvider, callStructured } from '@/lib/ai/client';

const KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'AI_OFFLINE'] as const;

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('model provider selection', () => {
  it('runs offline when no key is set', async () => {
    expect(aiProvider()).toBeNull();
    expect(AI_ENABLED()).toBe(false);
    const r = await callStructured({
      schemaName: 'X', jsonSchema: {}, system: '', input: [], parse: () => ({}),
    });
    expect(r).toEqual({ ok: false, reason: 'DISABLED' });
  });

  it('an empty or whitespace key is not a key', () => {
    process.env.GEMINI_API_KEY = '   ';
    process.env.OPENAI_API_KEY = '';
    expect(aiProvider()).toBeNull();
  });

  it('prefers Gemini and points it at the OpenAI-compatible endpoint', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.OPENAI_API_KEY = 'openai-test';
    const p = aiProvider()!;
    expect(p.name).toBe('gemini');
    expect(p.model).toBe('gemini-2.5-flash');
    expect(p.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
  });

  it('honours the model and base-url overrides', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    process.env.GEMINI_BASE_URL = 'https://proxy.example/v1/';
    const p = aiProvider()!;
    expect(p.model).toBe('gemini-2.5-pro');
    expect(p.baseURL).toBe('https://proxy.example/v1/');
  });

  it('AI_OFFLINE beats a present key, so a deployment can be forced offline', () => {
    process.env.GEMINI_API_KEY = 'gemini-test';
    process.env.OPENAI_API_KEY = 'openai-test';
    process.env.AI_OFFLINE = 'true';
    expect(aiProvider()).toBeNull();
    expect(AI_ENABLED()).toBe(false);
  });

  it('falls back to OpenAI when only that key is set', () => {
    process.env.OPENAI_API_KEY = 'openai-test';
    const p = aiProvider()!;
    expect(p.name).toBe('openai');
    expect(p.baseURL).toBeUndefined();
  });
});
