import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe('module boundaries', () => {
  it('lib/engine imports nothing from lib/ai or openai', () => {
    const offenders = walk('lib/engine').filter((f) =>
      /from\s+['"](openai|\.\.\/ai\/|@\/lib\/ai\/)/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no client component references a model API key', () => {
    const offenders = [...walk('components'), ...walk('app')].filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /^['"]use client['"]/m.test(src.slice(0, 200)) && /(OPENAI|GEMINI|GOOGLE)_API_KEY/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('no NEXT_PUBLIC_ variable exposes a model API key', () => {
    const offenders = [...walk('lib'), ...walk('app'), ...walk('components')].filter((f) =>
      /NEXT_PUBLIC_[A-Z_]*(OPENAI|GEMINI|GOOGLE)/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('has no committed API key literal', () => {
    const offenders = [...walk('lib'), ...walk('app'), ...walk('components'), ...walk('tests'), ...walk('scripts')].filter((f) =>
      /(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('.env.example carries no secret values', () => {
    const offenders = readFileSync('.env.example', 'utf8')
      .split('\n')
      .map((l) => /^([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD))=(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => Boolean(m) && m![2]!.trim() !== '')
      .map((m) => m[1]);
    expect(offenders).toEqual([]);
  });

  it('has no Aadhaar-shaped literal anywhere', () => {
    const offenders = [...walk('lib'), ...walk('app'), ...walk('components'), ...walk('tests')].filter((f) =>
      /\b\d{12}\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
