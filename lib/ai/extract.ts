import type { FactInput, Provenance } from '../types';
import { isFactKey, normaliseFactValue } from '../engine/facts';
import { log } from '../log';
import { callStructured, type InputPart } from './client';
import { EXTRACTION_JSON_SCHEMA, ExtractionResult, FACT_KEY_SPEC, safeParse } from './schemas';
import { fallbackExtract } from './fallback';

const SYSTEM = `You extract structured facts from an Indian scholarship student's description of a payment problem.

You will receive: the student's own words, optional text pasted from a portal, and optional screenshots
of a portal page.

Rules:
1. Only output facts from the FACT KEY LIST. Never invent a key.
2. Use "UNKNOWN" whenever the input does not clearly state or show the fact. Guessing is a failure.
3. Distinguish what the STUDENT claims from what a SCREENSHOT shows. Set "source" accordingly.
4. Never infer that a payment succeeded, failed, or was returned unless the input says so in words.
5. "Sanctioned" or "approved" on a portal means a sanction was issued. It does NOT mean money was sent.
   Do not set payment_system_result from a sanction status.
6. Hindi, Hinglish, and Indian-English input are all normal. Read them without asking for translation.
7. If the input contains a number that looks like an Aadhaar number, a bank account number or an OTP,
   ignore it completely and never echo it.
8. Also return: a one-sentence neutral restatement of the student's situation in plain English, and any
   phrases you could not interpret.

An account being "linked" or "seeded" with Aadhaar is NOT the same as the account being enabled for
benefit transfers. Never set dbt_enabled_reported from a statement about linking.`;

export type ExtractOutput = {
  facts: FactInput[];
  restatement: string;
  uninterpreted: string[];
  screenshotText: { file: string; text: string }[];
  unreadableFiles: string[];
  mode: 'model' | 'fallback';
};

const SOURCE_PROVENANCE: Record<string, Provenance> = {
  STUDENT_TEXT: 'USER_STATED',
  PASTED_STATUS: 'USER_STATED',
  SCREENSHOT: 'AI_INFERENCE',
};

function toFactInputs(r: ExtractionResult): FactInput[] {
  const out: FactInput[] = [];
  for (const f of r.facts) {
    if (!isFactKey(f.key)) {
      log('warn', { event: 'AI_UNKNOWN_FACT_KEY' });
      continue;
    }
    const value = normaliseFactValue(f.key, f.value);
    if (value === null) {
      log('warn', { event: 'AI_BAD_FACT_VALUE', key: f.key });
      continue;
    }
    if (value === 'UNKNOWN') continue;
    out.push({
      key: f.key,
      value,
      provenance: SOURCE_PROVENANCE[f.source] ?? 'AI_INFERENCE',
      confidence: f.source === 'SCREENSHOT' ? f.confidence : null,
      quote: f.quote || null,
    });
  }
  return out;
}

export async function extract(input: {
  description: string;
  statusText: string;
  images: { name: string; dataUrl: string }[];
}): Promise<ExtractOutput> {
  const parts: InputPart[] = [];
  if (input.description.trim()) parts.push({ type: 'input_text', text: `STUDENT'S OWN WORDS:\n${input.description}` });
  if (input.statusText.trim()) parts.push({ type: 'input_text', text: `PASTED PORTAL TEXT:\n${input.statusText}` });
  for (const img of input.images.slice(0, 3)) parts.push({ type: 'input_image', image_url: img.dataUrl });
  parts.push({ type: 'input_text', text: `FACT KEY LIST:\n${JSON.stringify(FACT_KEY_SPEC)}` });

  const res = await callStructured<ExtractionResult>({
    schemaName: 'ExtractionResult',
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    system: SYSTEM,
    input: parts,
    parse: safeParse(ExtractionResult),
    temperature: 0,
    maxOutputTokens: 1200,
  });

  if (res.ok) {
    const named = res.data.screenshotText.map((s) => s.file);
    return {
      facts: toFactInputs(res.data),
      restatement: res.data.restatement,
      uninterpreted: res.data.uninterpreted,
      screenshotText: res.data.screenshotText,
      unreadableFiles: input.images.map((i) => i.name).filter((n) => !named.includes(n)),
      mode: 'model',
    };
  }

  const fb = fallbackExtract({
    description: input.description,
    statusText: input.statusText,
    imageNames: input.images.map((i) => i.name),
  });
  return {
    facts: toFactInputs(fb.result),
    restatement: fb.result.restatement,
    uninterpreted: fb.result.uninterpreted,
    screenshotText: [],
    unreadableFiles: fb.unreadableFiles,
    mode: 'fallback',
  };
}
