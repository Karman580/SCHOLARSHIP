import type { Artifact, ArtifactInput } from '../types';
import { ARTIFACT_META, extractPlaceholders, validateArtifactBody } from '../engine/artifacts';
import { log } from '../log';
import { callStructured } from './client';
import { DRAFT_JSON_SCHEMA, DraftResult, safeParse } from './schemas';
import { fallbackDraft, type DraftContext } from './fallback';

const SYSTEM = `You draft a short, polite, factual request that an Indian college student will print or send themselves.

You are given: the artifact type, the recipient role, the case facts with their sources, and the current
step of the escalation ladder.

Rules:
- Only state facts you were given. If something is needed but unknown, insert a placeholder in double
  square brackets, e.g. [[your enrolment number]]. Never invent a value.
- Never claim that any system was checked by us, or that any authority has confirmed anything.
- Never threaten, never allege corruption, never demand a deadline shorter than the published one.
- Structure: subject line, one-line context, what is being requested (numbered if more than one),
  what the student has already done, closing with contact placeholder.
- Under 220 words for letters, under 150 words for grievance text, under 250 words for an RTI request.
- For an RTI draft, write specific, answerable questions about the applicant's own application only.
- End the body with exactly: "Prepared with Scholarship Saathi, an independent prototype."`;

export type DraftOutput = Omit<ArtifactInput, 'language'> & { mode: 'model' | 'template' };

export async function draft(c: DraftContext): Promise<DraftOutput> {
  const meta = ARTIFACT_META[c.type];

  // CASE_SUMMARY is a record of the case, not a letter. It is always composed deterministically
  // so that every provenance label in it is exactly what the engine recorded.
  if (c.type !== 'CASE_SUMMARY') {
    const res = await callStructured<DraftResult>({
      schemaName: 'DraftResult',
      jsonSchema: DRAFT_JSON_SCHEMA,
      system:
        c.language === 'hi'
          ? `${SYSTEM}\n\nWrite the output in simple Hindi (Devanagari). Keep official terms in English in brackets on first use, for example "छात्रवृत्ति (scholarship)". Do not transliterate English sentences into Devanagari.`
          : SYSTEM,
      input: [
        {
          type: 'input_text',
          text: JSON.stringify({
            artifactType: c.type,
            recipientRole: meta.recipient,
            wordLimit: meta.wordLimit,
            scheme: c.scheme,
            academicYear: c.academicYear,
            applicationReference: c.applicationRef,
            mostLikelyReason: c.topHypothesisLabel,
            confidenceBand: c.band,
            knownFacts: c.known,
            alreadyDone: c.alreadyDone,
            escalationStep: c.rungLabel,
          }),
        },
      ],
      parse: safeParse(DraftResult),
      temperature: 0.4,
      maxOutputTokens: 900,
    });

    if (res.ok) {
      const placeholders = extractPlaceholders(res.data.body);
      const check = validateArtifactBody(res.data.body, placeholders);
      if (check.ok) {
        return {
          type: c.type,
          recipient: res.data.recipient || meta.recipient,
          subject: res.data.subject,
          body: res.data.body,
          placeholders,
          generatedBy: 'model',
          mode: 'model',
        };
      }
      log('warn', { event: 'ARTIFACT_REJECTED', artifactType: c.type, reason: check.reason });
    }
  }

  const fb = fallbackDraft(c);
  const placeholders = extractPlaceholders(fb.body);
  return {
    type: c.type,
    recipient: fb.recipient,
    subject: fb.subject,
    body: fb.body,
    placeholders,
    generatedBy: 'template',
    mode: 'template',
  };
}

export function artifactSummary(a: Artifact): { id: string; type: string; recipient: string; subject: string | null } {
  return { id: a.id, type: a.type, recipient: a.recipient, subject: a.subject };
}
