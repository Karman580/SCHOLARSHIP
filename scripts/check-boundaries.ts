/**
 * Build gate. The engine must stay pure and the API key must stay server-side.
 * Failing here fails the build, deliberately.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const failures: string[] = [];

// 1. lib/engine must never import the AI layer or the OpenAI SDK.
for (const file of walk('lib/engine')) {
  const src = readFileSync(file, 'utf8');
  if (/from\s+['"](openai|\.\.\/ai\/|@\/lib\/ai\/)/.test(src)) {
    failures.push(`${file} imports the AI layer. lib/engine must stay pure.`);
  }
}

// 2. No client component may reference a model API key, for either provider.
const KEY_VARS = /(?:OPENAI|GEMINI|GOOGLE)_API_KEY/;
for (const file of [...walk('components'), ...walk('app')]) {
  const src = readFileSync(file, 'utf8');
  const isClient = /^['"]use client['"]/m.test(src.slice(0, 200));
  if (isClient && KEY_VARS.test(src)) {
    failures.push(`${file} is a client component and references a model API key.`);
  }
  if (/NEXT_PUBLIC_[A-Z_]*(OPENAI|GEMINI|GOOGLE)/.test(src)) {
    failures.push(`${file} exposes a model API key through a NEXT_PUBLIC_ variable.`);
  }
}

// 2b. No literal API key may be committed, in source or in a test.
const KEY_LITERAL = /(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})/;
for (const file of [...walk('lib'), ...walk('app'), ...walk('components'), ...walk('tests'), ...walk('scripts')]) {
  if (KEY_LITERAL.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file} contains something shaped like a live API key. Keys live in the environment only.`);
  }
}

// 3. Every key documented in .env.example must still be documented.
const REQUIRED_ENV = [
  'GEMINI_API_KEY', 'GEMINI_MODEL', 'AI_OFFLINE', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'AI_TIMEOUT_MS',
  'DATABASE_URL', 'APP_BASE_URL',
  'RATE_LIMIT_PER_MIN', 'MODEL_RATE_LIMIT_PER_MIN', 'DEMO_MODE_ONLY', 'MOCK_FAILURE_RATE', 'LOG_LEVEL',
];
const envExample = readFileSync('.env.example', 'utf8');
for (const key of REQUIRED_ENV) {
  if (!new RegExp(`^${key}=`, 'm').test(envExample)) failures.push(`.env.example is missing ${key}.`);
}
// .env.example is committed, so no secret may ever carry a value in it. Real keys go in
// .env.local, which is git-ignored. This catches a paste into the wrong file.
for (const line of envExample.split('\n')) {
  const m = /^([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD))=(.*)$/.exec(line);
  if (m && m[2]!.trim() !== '') failures.push(`.env.example has a value for ${m[1]}. Secrets belong in .env.local only.`);
}

// 4. No Aadhaar number anywhere. We never model Aadhaar itself.
for (const file of [...walk('lib'), ...walk('app'), ...walk('components'), ...walk('tests')]) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.match(/\b\d{12}\b/g) ?? []) {
    failures.push(`${file} contains a 12-digit literal (${m.slice(0, 2)}…). No Aadhaar-shaped values in this codebase.`);
  }
}

if (failures.length) {
  console.error('Boundary check failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Boundary check passed.');
