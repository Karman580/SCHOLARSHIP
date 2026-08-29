import { describe, expect, it } from 'vitest';
import { checkImage, MAX_FILE_BYTES } from '@/lib/uploads';
import { MemoryRepo } from '@/lib/db/memory';
import { redact } from '@/lib/redact';
import { extract } from '@/lib/ai/extract';
import { mergeFacts } from '@/lib/engine/facts';

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], 'a.png', { type: 'image/png' });
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
const webp = () => new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1])], 'a.webp', { type: 'image/webp' });
const liar = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3])], 'a.png', { type: 'image/png' });

describe('upload checks', () => {
  it('accepts JPEG, PNG and WebP by magic bytes', async () => {
    for (const f of [png(), jpeg(), webp()]) {
      const r = await checkImage(f);
      expect(r.ok, f.name).toBe(true);
      if (r.ok) expect(r.dataUrl.startsWith('data:image/')).toBe(true);
    }
  });

  it('rejects a file whose extension lies about its content', async () => {
    expect(await checkImage(liar())).toEqual({ ok: false, code: 'UPLOAD_UNSUPPORTED' });
  });

  it('rejects a file over 5 MB before reading it', async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.png', { type: 'image/png' });
    expect(await checkImage(big)).toEqual({ ok: false, code: 'UPLOAD_TOO_LARGE' });
  });
});

describe('intake pipeline', () => {
  it('persists no image bytes anywhere in the store', async () => {
    const repo = new MemoryRepo();
    const c = await repo.createCase({});
    const checked = await checkImage(png());
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;

    const description = redact('portal shows sanctioned, nothing came');
    await repo.addEvidence(c.id, { kind: 'FREE_TEXT', content: description });
    const out = await extract({ description, statusText: '', images: [{ name: 'a.png', dataUrl: checked.dataUrl }] });
    await repo.upsertFacts(c.id, mergeFacts([], out.facts));

    const dump = JSON.stringify(await repo.getCaseByToken(c.token));
    expect(dump).not.toContain('data:image');
    expect(dump).not.toContain('base64');
    expect(dump).not.toContain(checked.dataUrl.slice(30, 60));
  });

  it('stores redacted text only', async () => {
    const repo = new MemoryRepo();
    const c = await repo.createCase({});
    const account = '9876' + '54321098';
    await repo.addEvidence(c.id, { kind: 'FREE_TEXT', content: redact(`my account is ${account}`) });
    const dump = JSON.stringify(await repo.getCaseByToken(c.token));
    expect(dump).not.toContain(account);
    expect(dump).toContain('[removed]');
  });

  it('accepts text-only intake', async () => {
    const out = await extract({ description: 'sanctioned since December, no money', statusText: '', images: [] });
    expect(out.facts.length).toBeGreaterThan(0);
    expect(out.mode).toBe('fallback');
  });

  it('accepts text plus pasted status', async () => {
    const out = await extract({ description: 'no money yet', statusText: 'Application Status: SANCTIONED', images: [] });
    expect(out.facts.some((f) => f.key === 'portal_status_code' && f.value === 'SANCTIONED')).toBe(true);
  });
});
