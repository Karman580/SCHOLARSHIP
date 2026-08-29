/**
 * Build gate. testing.md §5: the intake route's JavaScript must stay under 150 KB
 * gzipped. Runs after `next build` and reads the manifest that build just wrote.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 150);
const ROUTES = ['/start/page', '/page', '/case/[token]/page'];

type Manifest = { pages: Record<string, string[]> };

let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync('.next/app-build-manifest.json', 'utf8')) as Manifest;
} catch {
  console.error('Bundle check: no .next/app-build-manifest.json. Run `next build` first.');
  process.exit(1);
}

let failed = false;
for (const route of ROUTES) {
  const files = manifest.pages[route];
  if (!files) {
    console.error(`Bundle check: route ${route} is not in the manifest.`);
    failed = true;
    continue;
  }
  // Each chunk is measured gzipped and on its own: that is what the browser pulls
  // over the wire, and shared chunks are counted once per route because the route
  // cannot render without them.
  let bytes = 0;
  for (const f of new Set(files)) {
    const p = join('.next', f);
    if (!statSync(p, { throwIfNoEntry: false })) continue;
    bytes += gzipSync(readFileSync(p)).byteLength;
  }
  const kb = bytes / 1024;
  const verdict = kb <= BUDGET_KB ? 'ok' : 'OVER BUDGET';
  console.log(`  ${route.padEnd(22)} ${kb.toFixed(1).padStart(7)} KB gzipped  (budget ${BUDGET_KB} KB) ${verdict}`);
  if (kb > BUDGET_KB) failed = true;
}

if (failed) {
  console.error('Bundle budget exceeded.');
  process.exit(1);
}
console.log('Bundle budget passed.');
