# AI Integration

## 1. Division of responsibility (the rule everything else follows)

| The model does | The model must never do |
|----------------|-------------------------|
| Read messy free text and screenshots and return **structured facts** | Decide which failure state the case is in |
| **Phrase and order** questions the engine already selected | Invent a question outside the bank |
| Turn the engine's top hypothesis into a **plain-language sentence** | Change the ranking or the confidence |
| Draft **letters, grievances, RTI text** from case facts | State any government record as fact |
| Translate output to Hindi | Assert a payment status, a date, or an amount not present in the facts |

Enforced in code:
- `lib/engine/*` never imports `openai` (lint rule + `tests/unit/boundaries.spec.ts`).
- Every model output is parsed by a Zod schema; unknown fact keys are dropped and logged.
- `explain()` receives the ranking as **input** and its schema has no field that could alter it.
- A post-validator rejects any artifact or verdict containing prohibited claim patterns (§6).

## 2. Client (`lib/ai/client.ts`)

```ts
import OpenAI from 'openai';

export const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY);
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';   // must be vision-capable
const TIMEOUT = Number(process.env.OPENAI_TIMEOUT_MS ?? 12000);

export async function callStructured<T>(args: {
  schemaName: string;
  jsonSchema: object;          // from zod-to-json-schema
  system: string;
  input: Array<{type:'input_text';text:string} | {type:'input_image';image_url:string}>;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<{ok:true; data:T} | {ok:false; reason:'DISABLED'|'TIMEOUT'|'ERROR'|'INVALID'}>;
```

Behaviour:
- If `!AI_ENABLED` → `{ok:false, reason:'DISABLED'}` immediately (no network call).
- Uses the Responses API with `text.format = {type:'json_schema', name, schema, strict:true}`.
- One retry on 429/5xx with 800ms jitter backoff. No retry on timeout.
- Parses with Zod; on parse failure returns `INVALID` (never throws to the route).
- Records `durationMs` and `reason` in logs; never logs prompt or completion content.

Every non-`ok` result routes the caller to `lib/ai/fallback.ts` and sets `case.ai_mode='fallback'`.

## 3. Call 1 — Extraction (`lib/ai/extract.ts`)

**Purpose:** messy text + screenshots → canonical facts. This is where the model earns its place:
students write "clg ne kar diya, portal pe sanction dikha raha hai since Dec, paisa nahi aaya" and paste
a cropped screenshot of a status table.

**System prompt (verbatim):**

```
You extract structured facts from an Indian scholarship student's description of a payment problem.

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
```

**Input construction:**
```
input_text:  "STUDENT'S OWN WORDS:\n" + description
input_text:  "PASTED PORTAL TEXT:\n" + statusText          (omit if empty)
input_image: dataUrl                                        (per screenshot, max 3)
input_text:  "FACT KEY LIST:\n" + JSON.stringify(FACT_KEY_SPEC)
```

**Output schema** (`ExtractionResult`):
```ts
z.object({
  facts: z.array(z.object({
    key: z.enum(FACT_KEYS),
    value: z.string(),                    // must match the key's allowed values or 'UNKNOWN'
    source: z.enum(['STUDENT_TEXT','PASTED_STATUS','SCREENSHOT']),
    confidence: z.number().min(0).max(1),
    quote: z.string().max(160).optional() // the words this came from, for the UI's "why we think so"
  })),
  restatement: z.string().max(280),
  uninterpreted: z.array(z.string().max(120)),
  screenshotText: z.array(z.object({ file: z.string(), text: z.string().max(2000) }))
})
```
`temperature: 0`. Post-validation: drop facts whose `value` is not in the key's allowed set; map
`source` → provenance (`STUDENT_TEXT|PASTED_STATUS` → `USER_STATED`; `SCREENSHOT` → `AI_INFERENCE`
with the extracted quote shown in the UI).

**Fallback** (`fallback.extract`): regex/keyword parser over the text — status keywords
(`sanction`, `approved`, `under process`, `defective`, `verified`, `rejected`, `स्वीकृत`, `लंबित`),
month/date patterns for `days_since_sanction`, `not received|nahi aaya|no money` → `credit_seen=NO`,
scheme keywords. Screenshots are skipped with the note *"We can't read images in offline mode — paste
the text instead."*

## 4. Call 2 — Question phrasing (`lib/ai/question.ts`)

The **engine** returns up to 3 candidate questions ranked by information gain. The model only chooses
wording and order, from that fixed set.

**System prompt:**
```
You help a scholarship student answer a short diagnostic question. You will receive 1-3 candidate
questions, each with an id, a neutral wording, and the two possibilities it separates.

Return: the id you would ask first, a rewording in simple Indian English at Grade 8 reading level, and
a one-sentence "why we are asking" that names the two possibilities in plain words.

Rules:
- You may only return an id from the candidates. Never write a new question.
- Never change what the question is asking. Only make it easier to understand.
- Never imply the student did something wrong.
- Keep the question under 20 words. Keep answer option labels under 6 words each.
```
**Schema:** `{ chosenId: enum(candidateIds), prompt: string, why: string, optionLabels: Record<string,string> }`.
`temperature: 0.3`. Fallback: take candidate[0] and its template wording verbatim.

## 5. Call 3 — Verdict explanation (`lib/ai/explain.ts`)

**Input:** the engine's ranked hypotheses with scores, the known facts with provenance, the unknown list,
and the journey stages. **The model cannot change any of it.**

**System prompt:**
```
You explain a diagnosis to a scholarship student. You are given a ranked list of possible reasons a
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
- Plain Indian English, short sentences, no jargon without a gloss.
```
**Schema:** `{ verdictText: string(max 200), why: string[](2..4), unknownExplained: {id, text}[] }`
`temperature: 0.2`. Fallback: `HYPOTHESIS_TEMPLATES[topId].verdict` with facts interpolated.

## 6. Call 4 — Artifact drafting (`lib/ai/draft.ts`)

**Purpose:** produce the letter/grievance/RTI the student sends. This is the highest-value model use and
the highest-risk one, so it is the most constrained.

**System prompt:**
```
You draft a short, polite, factual request that an Indian college student will print or send themselves.

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
- End the body with exactly: "Prepared with Scholarship Saathi, an independent prototype."
```
**Schema:** `{ recipient, subject, body, placeholders: string[] }`, `temperature: 0.4`.

**Post-validators (all must pass or the template fallback is used):**
- Body contains the exact closing line.
- Body contains no digits sequence of length ≥ 9 (no invented account/Aadhaar-shaped numbers).
- Body matches none of the prohibited patterns:
  `/we (have )?(checked|verified|confirmed)/i`, `/(PFMS|NPCI|Aadhaar|bank) (records? )?(show|confirm)/i`,
  `/your (file|application) is (at|with) [A-Z]/`, `/will be credited (on|by)/i`,
  `/we (have )?(submitted|filed|lodged)/i`.
- `placeholders.length <= 6`.

**Fallback:** deterministic templates per artifact type in `lib/ai/fallback.ts`, same structure, facts
interpolated, unknowns rendered as `[[…]]`. The templates are the source of truth for tone; the model is
asked to match them.

## 7. Call 5 — Hindi rendering

Same `draft` / `explain` calls with `language: 'hi'` appended to the system prompt:
`Write the output in simple Hindi (Devanagari). Keep official terms in English in brackets on first use,
for example "छात्रवृत्ति (scholarship)". Do not transliterate English sentences into Devanagari.`
Fallback: pre-translated static templates for the three demo cases and the six artifact types (ship these
as JSON so Hindi works offline too).

## 8. Cost, latency, limits

| Call | Typical tokens | Budget | Timeout |
|------|----------------|--------|---------|
| extract (text only) | ~1.2k in / 0.5k out | — | 12s |
| extract (with 2 images) | ~3k in / 0.6k out | — | 12s |
| question | ~0.5k / 0.2k | — | 8s |
| explain | ~1.2k / 0.4k | — | 8s |
| draft | ~1.4k / 0.5k | — | 12s |

`max_output_tokens` set per call. Model calls are never made in a loop and never more than one per HTTP
request except intake (extract only). No streaming to the client is required; the intake progress list is
driven by server-sent stage markers, not token streaming.

## 9. Where the model is genuinely necessary (write this on `/about`)

1. **Uncontrolled input.** "clg ne verify kar diya but portal pe abhi bhi under process" is not parseable
   by a form. The model converts it into the exact fields the engine needs.
2. **Screenshots.** Students send images, not text. Reading a cropped status table from a photo is not a
   deterministic task.
3. **Explaining uncertainty in the student's own terms.** The engine produces a ranking; turning
   "two hypotheses within 0.1" into "we can't tell yet — this one check separates them" in plain Hindi or
   English is language work.
4. **Artifact drafting.** Every letter differs by scheme, elapsed time, what was already tried, and which
   rung of the ladder the student is on. Templates alone produce letters officials ignore.

And where it is **not** necessary, stated equally plainly: the diagnosis logic itself, the confidence, the
state machine and the mock records are all deterministic — because they must be reproducible and auditable.
