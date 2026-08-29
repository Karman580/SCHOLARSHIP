import type { Band, KnownItem, JourneyStage, RankedHypothesis, UnknownItem } from '../types';
import { PROHIBITED_PATTERNS } from '../engine/artifacts';
import { callStructured } from './client';
import { EXPLANATION_JSON_SCHEMA, Explanation, safeParse } from './schemas';
import { fallbackExplain } from './fallback';

const SYSTEM = `You explain a diagnosis to a scholarship student. You are given a ranked list of possible reasons a
payment has not arrived, already scored by a rules engine, plus what is known and unknown.

Write:
1. verdictText: one sentence saying the most likely reason in plain words. If the band is LOW, the
   sentence must say we cannot narrow it down yet and name the two leading possibilities.
2. why: 2-4 short bullets, each pointing at a specific fact you were given.
3. unknownExplained: for each unknown, one sentence on why it matters.

Rules:
- Use only the facts given. Never add a fact, a date, an amount or an office name.
- Never say or imply that we checked any government, bank, Aadhaar or payment system.
- Never say a file is with a particular officer or desk.
- Never promise the money will arrive or give a date.
- Do not reorder or re-rank anything. The ranking is fixed.
- Plain Indian English, short sentences, no jargon without a gloss.`;

export type ExplainOutput = {
  verdictText: string;
  why: string[];
  unknownExplained: { id: string; text: string }[];
  mode: 'model' | 'fallback';
};

function clean(text: string): boolean {
  return !PROHIBITED_PATTERNS.some(({ pattern }) => pattern.test(text));
}

export async function explain(input: {
  band: Band;
  ranked: RankedHypothesis[];
  known: KnownItem[];
  unknown: UnknownItem[];
  journey: JourneyStage[];
  language: 'en' | 'hi';
}): Promise<ExplainOutput> {
  const res = await callStructured<Explanation>({
    schemaName: 'Explanation',
    jsonSchema: EXPLANATION_JSON_SCHEMA,
    system:
      input.language === 'hi'
        ? `${SYSTEM}\n\nWrite the output in simple Hindi (Devanagari). Keep official terms in English in brackets on first use, for example "छात्रवृत्ति (scholarship)". Do not transliterate English sentences into Devanagari.`
        : SYSTEM,
    input: [
      {
        type: 'input_text',
        text: JSON.stringify({
          band: input.band,
          ranked: input.ranked.slice(0, 4),
          known: input.known,
          unknown: input.unknown,
          journey: input.journey,
        }),
      },
    ],
    parse: safeParse(Explanation),
    temperature: 0.2,
    maxOutputTokens: 600,
    timeoutMs: 8000,
  });

  if (res.ok && clean(res.data.verdictText) && res.data.why.every(clean)) {
    const byId = new Map(res.data.unknownExplained.map((u) => [u.id, u.text]));
    return {
      verdictText: res.data.verdictText,
      why: res.data.why,
      // The engine's how-to-find-out survives even if the model omitted an id.
      unknownExplained: input.unknown.map((u) => ({ id: u.id, text: byId.get(u.id) ?? u.howToFindOut })),
      mode: 'model',
    };
  }

  return { ...fallbackExplain(input), mode: 'fallback' };
}
