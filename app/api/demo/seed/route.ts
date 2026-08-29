import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { seedFor } from '@/lib/gov-mock/seed';
import { extract } from '@/lib/ai/extract';
import { mergeFacts } from '@/lib/engine/facts';
import { transition } from '@/lib/engine/machine';
import { nextQuestion, runDiagnosis } from '@/lib/service';
import { guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({ caseNo: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict();

export async function POST(req: Request) {
  const limited = guardRate(req, 'model');
  if (limited) return limited;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepo();
    const seed = seedFor(parsed.data.caseNo);
    // Idempotent: resets this case's synthetic rows so a judge can re-run cleanly.
    await repo.gov.resetSeed(parsed.data.caseNo);

    const c = await repo.createCase({
      isDemo: true,
      demoCaseNo: parsed.data.caseNo,
      applicationId: seed.application.applicationId,
    });
    await repo.addEvent(c.id, { type: 'CASE_CREATED', actor: 'USER', summary: `Demo case ${parsed.data.caseNo} created with synthetic records.` });

    await repo.setCaseState(c.id, transition('NEW', 'INTAKE_RECEIVED').nextState);
    await repo.addEvidence(c.id, { kind: 'FREE_TEXT', content: seed.intakeText });
    await repo.addEvidence(c.id, { kind: 'PASTED_STATUS', content: seed.statusText });
    await repo.addEvent(c.id, { type: 'INTAKE_RECEIVED', actor: 'USER', summary: 'Demo intake text loaded.' });

    const extracted = await extract({ description: seed.intakeText, statusText: seed.statusText, images: [] });
    if (extracted.mode === 'fallback') {
      await repo.setAiMode(c.id, 'fallback');
      await repo.addEvent(c.id, { type: 'AI_FALLBACK_USED', actor: 'SAATHI', summary: 'Extraction came from built-in rules.' });
    }
    const merged = mergeFacts([], [
      ...extracted.facts,
      { key: 'application_id', value: seed.application.applicationId, provenance: 'SIMULATED' as const },
      { key: 'academic_year', value: seed.application.academicYear, provenance: 'SIMULATED' as const },
    ]);
    await repo.upsertFacts(c.id, merged);
    await repo.addEvent(c.id, { type: 'FACTS_EXTRACTED', actor: 'SAATHI', summary: `${merged.length} facts recorded.` });

    await repo.setCaseState(c.id, transition('INTAKE', 'FACTS_EXTRACTED').nextState);
    const fresh = (await repo.getCaseByToken(c.token))!;
    const nq = await nextQuestion(repo, fresh.case);
    if (nq.question) {
      await repo.setCaseState(c.id, transition('EXTRACTED', 'HAS_QUESTION').nextState);
    } else {
      await repo.setCaseState(c.id, transition('EXTRACTED', 'NO_QUESTION').nextState);
      await runDiagnosis(repo, fresh.case);
      await repo.setCaseState(c.id, transition('DIAGNOSED', 'ACTIONS_ISSUED').nextState);
    }

    return ok({ token: c.token, caseNo: parsed.data.caseNo }, 201);
  } catch (err) {
    return serverError('POST /api/demo/seed', err);
  }
}
