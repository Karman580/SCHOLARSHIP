import type { Candidate } from '../engine/questions';
import { callStructured } from './client';
import { QUESTION_JSON_SCHEMA, QuestionPhrasing, safeParse } from './schemas';
import { fallbackQuestion } from './fallback';

const SYSTEM = `You help a scholarship student answer a short diagnostic question. You will receive 1-3 candidate
questions, each with an id, a neutral wording, and the two possibilities it separates.

Return: the id you would ask first, a rewording in simple Indian English at Grade 8 reading level, and
a one-sentence "why we are asking" that names the two possibilities in plain words.

Rules:
- You may only return an id from the candidates. Never write a new question.
- Never change what the question is asking. Only make it easier to understand.
- Never imply the student did something wrong.
- Keep the question under 20 words. Keep answer option labels under 6 words each.`;

export type PhrasedQuestion = {
  id: string;
  prompt: string;
  why: string;
  options: { id: string; label: string }[];
  allowDontKnow: true;
  howToCheck?: { steps: string[]; provenance: 'PUBLIC_RULE' };
  mode: 'model' | 'fallback';
};

export async function phraseQuestion(candidates: Candidate[], language: 'en' | 'hi'): Promise<PhrasedQuestion> {
  const chosen = candidates[0]!.question;

  const payload = candidates.map((c) => ({
    id: c.question.id,
    neutralWording: c.question.prompt,
    separates: c.question.why,
    options: c.question.options.map((o) => ({ id: o.id, label: o.label })),
  }));

  const res = await callStructured<QuestionPhrasing>({
    schemaName: 'QuestionPhrasing',
    jsonSchema: QUESTION_JSON_SCHEMA,
    system: language === 'hi' ? `${SYSTEM}\n\nWrite the output in simple Hindi (Devanagari). Keep official terms in English in brackets on first use, for example "छात्रवृत्ति (scholarship)". Do not transliterate English sentences into Devanagari.` : SYSTEM,
    input: [{ type: 'input_text', text: JSON.stringify(payload) }],
    parse: safeParse(QuestionPhrasing),
    temperature: 0.3,
    maxOutputTokens: 400,
    timeoutMs: 8000,
  });

  const allowedIds = new Set(candidates.map((c) => c.question.id));
  if (res.ok && allowedIds.has(res.data.chosenId)) {
    const picked = candidates.find((c) => c.question.id === res.data.chosenId)!.question;
    const labels = new Map(res.data.optionLabels.map((o) => [o.id, o.label]));
    return {
      id: picked.id,
      prompt: res.data.prompt,
      why: res.data.why,
      options: picked.options.map((o) => ({ id: o.id, label: labels.get(o.id) ?? o.label })),
      allowDontKnow: true,
      howToCheck: picked.howToCheck ? { steps: picked.howToCheck.steps, provenance: 'PUBLIC_RULE' } : undefined,
      mode: 'model',
    };
  }

  const fb = fallbackQuestion(chosen);
  return {
    id: chosen.id,
    prompt: fb.prompt,
    why: fb.why,
    options: chosen.options.map((o) => ({ id: o.id, label: fb.optionLabels[o.id] ?? o.label })),
    allowDontKnow: true,
    howToCheck: chosen.howToCheck ? { steps: chosen.howToCheck.steps, provenance: 'PUBLIC_RULE' } : undefined,
    mode: 'fallback',
  };
}
