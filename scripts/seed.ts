import { getRepo } from '../lib/db/repo';
import { SEEDS } from '../lib/gov-mock/seed';
import { runDemoCase } from '../lib/demo-runner';

const EXPECTED: Record<number, string> = { 1: 'RESOLVED', 2: 'ESCALATED', 3: 'RESOLVED' };

const repo = getRepo();
for (const s of SEEDS) await repo.gov.resetSeed(s.caseNo);
console.log(`Seeded ${SEEDS.length} demo applications — all records are synthetic.`);

const results: string[] = [];
let failed = false;
for (const s of SEEDS) {
  const r = await runDemoCase(repo, s.caseNo);
  const good = r.finalState === EXPECTED[s.caseNo];
  if (!good) failed = true;
  results.push(`case ${s.caseNo} -> ${r.finalState}`);
  console.log(
    `  case ${s.caseNo}: top=${r.topHypothesis} runnerUp=${r.runnerUp} band=${r.band} questions=[${r.askedQuestions.join(', ')}] ` +
      `verify=${r.verifyResult} state=${r.finalState}${good ? '' : `  EXPECTED ${EXPECTED[s.caseNo]}`}`,
  );
}

console.log(`Self-check: ${results.join(', ')}. ${failed ? 'FAILED' : 'OK'}`);
if (failed) process.exit(1);
