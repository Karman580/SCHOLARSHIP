import { getRepo } from '@/lib/db/repo';
import { redact } from '@/lib/redact';
import { checkImage, MAX_FILES } from '@/lib/uploads';
import { extract } from '@/lib/ai/extract';
import { mergeFacts, normaliseFactValue } from '@/lib/engine/facts';
import { transition } from '@/lib/engine/machine';
import { envelope, nextQuestion, runDiagnosis } from '@/lib/service';
import { fail, guardRate, ok, serverError } from '@/lib/http';
import { log } from '@/lib/log';
import type { FactInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req, 'model');
  if (limited) return limited;
  const { token } = await ctx.params;
  const started = Date.now();

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const c = cwr.case;

    const form = await req.formData();
    const description = redact(String(form.get('description') ?? '')).slice(0, 4000);
    const statusText = redact(String(form.get('statusText') ?? '')).slice(0, 2000);
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_FILES);

    if (!description.trim() && !statusText.trim() && !files.length) {
      return fail('VALIDATION_ERROR', 'Tell us what is happening, paste the portal status, or add a screenshot.');
    }

    const images: { name: string; dataUrl: string }[] = [];
    const unreadableFiles: string[] = [];
    for (const f of files) {
      const checked = await checkImage(f);
      if (!checked.ok) {
        if (checked.code === 'UPLOAD_TOO_LARGE') {
          return fail('UPLOAD_TOO_LARGE', 'That image is over 5 MB. Take a screenshot instead of a photo, or crop it.');
        }
        return fail('UPLOAD_UNSUPPORTED', 'We can only read JPEG, PNG or WebP images.');
      }
      images.push({ name: f.name, dataUrl: checked.dataUrl });
    }

    if (c.state === 'NEW') {
      await repo.setCaseState(c.id, transition('NEW', 'INTAKE_RECEIVED').nextState);
    }
    if (description.trim()) await repo.addEvidence(c.id, { kind: 'FREE_TEXT', content: description });
    if (statusText.trim()) await repo.addEvidence(c.id, { kind: 'PASTED_STATUS', content: statusText });
    await repo.addEvent(c.id, {
      type: 'INTAKE_RECEIVED',
      actor: 'USER',
      summary: `Received ${description.length} characters of description, ${files.length} image(s).`,
    });

    const extracted = await extract({ description, statusText, images });
    // Image bytes go out of scope here. Only extracted text is ever persisted.
    images.length = 0;

    if (extracted.mode === 'fallback') {
      await repo.setAiMode(c.id, 'fallback');
      await repo.addEvent(c.id, { type: 'AI_FALLBACK_USED', actor: 'SAATHI', summary: 'Extraction came from built-in rules.' });
    }
    for (const s of extracted.screenshotText) {
      const text = redact(s.text);
      if (text.trim()) await repo.addEvidence(c.id, { kind: 'SCREENSHOT_TEXT', content: text, sourceLabel: s.file });
    }
    unreadableFiles.push(...extracted.unreadableFiles);

    // Anything the student typed into the basics block beats anything a model inferred.
    const typed: FactInput[] = [];
    for (const key of ['schemeType', 'academicYear', 'portal'] as const) {
      const raw = String(form.get(key) ?? '').trim();
      if (!raw) continue;
      const factKey = key === 'schemeType' ? 'scheme_type' : key === 'academicYear' ? 'academic_year' : 'portal';
      const value = normaliseFactValue(factKey, raw);
      if (value && value !== 'UNKNOWN') typed.push({ key: factKey, value, provenance: 'USER_STATED' });
    }

    const existing = await repo.getFacts(c.id);
    const merged = mergeFacts(existing, [...extracted.facts, ...typed]);
    await repo.upsertFacts(c.id, merged);
    await repo.addEvent(c.id, {
      type: 'FACTS_EXTRACTED',
      actor: 'SAATHI',
      summary: `${merged.length} facts recorded.`,
      payload: { restatement: extracted.restatement, mode: extracted.mode },
    });

    await repo.setCaseState(c.id, transition('INTAKE', 'FACTS_EXTRACTED').nextState);
    const fresh = (await repo.getCaseByToken(token))!;
    const nq = await nextQuestion(repo, fresh.case);
    if (nq.question) {
      await repo.setCaseState(fresh.case.id, transition('EXTRACTED', 'HAS_QUESTION').nextState);
    } else {
      await repo.setCaseState(fresh.case.id, transition('EXTRACTED', 'NO_QUESTION').nextState);
      await runDiagnosis(repo, fresh.case);
      const withDiag = (await repo.getCaseByToken(token))!;
      await repo.setCaseState(withDiag.case.id, transition('DIAGNOSED', 'ACTIONS_ISSUED').nextState);
    }

    log('info', { route: 'intake', caseToken: token, event: 'INTAKE_DONE', durationMs: Date.now() - started, aiMode: extracted.mode });
    const final = (await repo.getCaseByToken(token))!;
    return ok(envelope(final, { nextQuestion: nq.question, unreadableFiles }));
  } catch (err) {
    return serverError('POST /api/cases/[token]/intake', err);
  }
}
