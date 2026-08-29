import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { ARTIFACT_TYPES } from '@/lib/types';
import { draft } from '@/lib/ai/draft';
import { buildDraftContext } from '@/lib/service';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  type: z.enum(ARTIFACT_TYPES),
  language: z.enum(['en', 'hi']).optional(),
  actionId: z.string().optional(),
}).strict();

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = guardRate(req, 'model');
  if (limited) return limited;
  const { token } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const language = parsed.data.language ?? cwr.case.language;

    const out = await draft(buildDraftContext(cwr, parsed.data.type, language));
    if (out.mode === 'template' && cwr.case.aiMode !== 'fallback') {
      await repo.addEvent(cwr.case.id, { type: 'AI_FALLBACK_USED', actor: 'SAATHI', summary: 'Letter came from a built-in template.' });
    }
    const artifact = await repo.saveArtifact(cwr.case.id, {
      type: out.type, language, recipient: out.recipient, subject: out.subject,
      body: out.body, placeholders: out.placeholders, generatedBy: out.generatedBy,
    });
    await repo.addEvent(cwr.case.id, {
      type: 'ARTIFACT_GENERATED', actor: 'SAATHI',
      summary: `Generated a ${parsed.data.type.toLowerCase().replace(/_/g, ' ')}.`,
      payload: { artifactId: artifact.id, generatedBy: out.generatedBy },
    });
    return ok({ artifact }, 201);
  } catch (err) {
    return serverError('POST artifacts', err);
  }
}
