import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '@/lib/db/memory';
import { SIMULATED_DISCLAIMER, govClient } from '@/lib/gov-mock/client';
import { SEEDS } from '@/lib/gov-mock/seed';

/** Stands in for the /api/gov routes so the client contract is tested without a server. */
function serve(repo: MemoryRepo, body: (path: string, params: URLSearchParams) => Promise<Record<string, unknown> | null>) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    const payload = await body(url.pathname.replace('/api/gov/', ''), url.searchParams);
    const json = payload
      ? { simulated: true, disclaimer: SIMULATED_DISCLAIMER, found: true, ...payload }
      : { simulated: true, disclaimer: SIMULATED_DISCLAIMER, found: false };
    void repo;
    return new Response(JSON.stringify(json), { status: 200, headers: { 'X-Saathi-Simulated': 'true' } });
  };
}

describe('mock government services', () => {
  const repo = new MemoryRepo();

  const handler = serve(repo, async (path, params) => {
    if (path === 'nsp/application') return (await repo.gov.getApplication(params.get('applicationId') ?? '')) as never;
    if (path === 'pfms/payment') return (await repo.gov.getPayment(params.get('applicationId') ?? '')) as never;
    if (path === 'npci/mapper') return (await repo.gov.getMapping(params.get('aliasKey') ?? '')) as never;
    if (path === 'bank/account') return (await repo.gov.getAccount(params.get('bankRefId') ?? '')) as never;
    return null;
  });

  it('returns every seeded record with the simulated flag and disclaimer', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = handler as typeof fetch;
    try {
      const client = govClient('http://test.local');
      for (const s of SEEDS) {
        expect((await client.getApplication(s.application.applicationId))!.scheme).toBe(s.application.scheme);
        expect(await client.getPayment(s.application.applicationId)).not.toBeNull();
        expect(await client.getMapping(s.application.aliasKey)).not.toBeNull();
        expect(await client.getAccount(s.application.bankRefId)).not.toBeNull();
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it('reports an unknown id as not found, with HTTP 200', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = handler as typeof fetch;
    try {
      expect(await govClient('http://test.local').getApplication('NSP-NOPE')).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('refuses a response that is not marked simulated', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ applicationId: 'NSP-REAL-0001', scheme: 'real' }), { status: 200 })) as typeof fetch;
    try {
      await expect(govClient('http://test.local').getApplication('NSP-REAL-0001')).rejects.toThrow(/not marked simulated/i);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('refuses a simulated response with no disclaimer', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ simulated: true, applicationId: 'X' }), { status: 200 })) as typeof fetch;
    try {
      await expect(govClient('http://test.local').getApplication('X')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });

  it('models no Aadhaar number at all', () => {
    for (const s of SEEDS) {
      expect(s.mapping.aliasKey).toMatch(/^ALIAS-DEMO-[A-Z]$/);
      expect(JSON.stringify(s)).not.toMatch(/\b\d{12}\b/);
    }
  });
});
