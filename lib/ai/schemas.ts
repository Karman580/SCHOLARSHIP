import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { FACT_KEYS, FACT_VALUES } from '../engine/facts';

export const ExtractionResult = z.object({
  facts: z.array(
    z.object({
      key: z.enum(FACT_KEYS),
      value: z.string(),
      source: z.enum(['STUDENT_TEXT', 'PASTED_STATUS', 'SCREENSHOT']),
      confidence: z.number().min(0).max(1),
      quote: z.string().max(160),
    }),
  ),
  restatement: z.string().max(280),
  uninterpreted: z.array(z.string().max(120)),
  screenshotText: z.array(z.object({ file: z.string(), text: z.string().max(2000) })),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const QuestionPhrasing = z.object({
  chosenId: z.string(),
  prompt: z.string().max(160),
  why: z.string().max(220),
  optionLabels: z.array(z.object({ id: z.string(), label: z.string().max(48) })),
});
export type QuestionPhrasing = z.infer<typeof QuestionPhrasing>;

export const Explanation = z.object({
  verdictText: z.string().max(240),
  why: z.array(z.string().max(180)).min(2).max(4),
  unknownExplained: z.array(z.object({ id: z.string(), text: z.string().max(200) })),
});
export type Explanation = z.infer<typeof Explanation>;

export const DraftResult = z.object({
  recipient: z.string().max(120),
  subject: z.string().max(160),
  body: z.string().max(4000),
  placeholders: z.array(z.string().max(60)),
});
export type DraftResult = z.infer<typeof DraftResult>;

/** OpenAI strict structured outputs require every property to be required and additionalProperties:false. */
function strictJsonSchema(schema: z.ZodTypeAny, name: string): object {
  const js = zodToJsonSchema(schema, { name, target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  const defs = (js.definitions ?? {}) as Record<string, unknown>;
  const root = (defs[name] ?? js) as Record<string, unknown>;
  return harden(root) as object;
}

function harden(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(harden);
  if (node && typeof node === 'object') {
    const o = { ...(node as Record<string, unknown>) };
    for (const k of Object.keys(o)) o[k] = harden(o[k]);
    if (o.type === 'object' && o.properties) {
      o.additionalProperties = false;
      o.required = Object.keys(o.properties as Record<string, unknown>);
    }
    return o;
  }
  return node;
}

export const EXTRACTION_JSON_SCHEMA = strictJsonSchema(ExtractionResult, 'ExtractionResult');
export const QUESTION_JSON_SCHEMA = strictJsonSchema(QuestionPhrasing, 'QuestionPhrasing');
export const EXPLANATION_JSON_SCHEMA = strictJsonSchema(Explanation, 'Explanation');
export const DRAFT_JSON_SCHEMA = strictJsonSchema(DraftResult, 'DraftResult');

/** Given to the model verbatim so it can only produce keys and values we accept. */
export const FACT_KEY_SPEC = FACT_KEYS.map((k) => ({
  key: k,
  allowedValues: FACT_VALUES[k] ?? 'free text',
}));

export function safeParse<T>(schema: z.ZodType<T>): (raw: unknown) => T | null {
  return (raw) => {
    const r = schema.safeParse(raw);
    return r.success ? r.data : null;
  };
}
