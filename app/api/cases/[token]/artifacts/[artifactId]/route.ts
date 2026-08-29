import { z } from 'zod';
import { getRepo } from '@/lib/db/repo';
import { redact } from '@/lib/redact';
import { extractPlaceholders } from '@/lib/engine/artifacts';
import { fail, guardRate, ok, parseJson, serverError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string; artifactId: string }> }) {
  const { token, artifactId } = await ctx.params;
  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const a = await repo.getArtifact(cwr.case.id, artifactId);
    if (!a) return fail('CASE_NOT_FOUND', 'We cannot find that letter.');
    return ok({ artifact: a });
  } catch (err) {
    return serverError('GET artifact', err);
  }
}

const Body = z.object({ body: z.string().min(1).max(8000) }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string; artifactId: string }> }) {
  const limited = guardRate(req);
  if (limited) return limited;
  const { token, artifactId } = await ctx.params;
  const parsed = await parseJson(req, Body);
  if (!parsed.ok) return parsed.response;
  try {
    const repo = getRepo();
    const cwr = await repo.getCaseByToken(token);
    if (!cwr) return fail('CASE_NOT_FOUND', 'We cannot find this case.');
    const a = await repo.getArtifact(cwr.case.id, artifactId);
    if (!a) return fail('CASE_NOT_FOUND', 'We cannot find that letter.');

    const body = redact(parsed.data.body);
    await repo.updateArtifactBody(artifactId, body);
    await repo.addEvent(cwr.case.id, { type: 'ARTIFACT_EDITED', actor: 'USER', summary: 'You edited the draft.' });
    return ok({ artifact: { ...a, body, edited: true, placeholders: extractPlaceholders(body) } });
  } catch (err) {
    return serverError('PATCH artifact', err);
  }
}
