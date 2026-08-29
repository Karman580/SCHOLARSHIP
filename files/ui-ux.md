# UI / UX Specification

The product must read as a **credible, serious public-service tool** without imitating any government
site. Do not use any government emblem, seal, logo, colour scheme, tricolour motif, or portal layout.
Original design only.

## 1. Design thesis

The subject is a **payment that vanished between systems**. The design's job is to make an invisible,
multi-stage journey visible and honest about its own blind spots. So the interface is built around one
structural idea: a **ledger rail** that shows every stage, including the stages nobody can see, drawn as
explicitly unknown rather than quietly omitted.

**Signature element:** the Payment Journey Rail (§4.1). It appears on the landing page in its blank state
and becomes the spine of the case. Everything else on the page stays quiet so the rail carries the page.

## 2. Tokens

Define in `app/globals.css` as CSS custom properties, consumed through Tailwind v4 `@theme`.

```css
@theme {
  /* Core */
  --color-ink:        #12203A;  /* primary text, rail spine */
  --color-ink-soft:   #40506B;  /* secondary text */
  --color-slate:      #6B7A90;  /* captions, disabled */
  --color-paper:      #F6F8FB;  /* page background (cool, not cream) */
  --color-surface:    #FFFFFF;  /* cards */
  --color-line:       #DFE5EE;  /* hairlines, borders */

  /* Semantic — these are the only accent colours */
  --color-confirmed:  #0E7C7B;  /* teal: confirmed stage, primary action */
  --color-unknown:    #B8791A;  /* amber: unknown / waiting */
  --color-blocked:    #A3232B;  /* deep red: the blocked stage */
  --color-note:       #4A5BA8;  /* indigo: informational badges */

  /* Radii, spacing */
  --radius-card: 10px;
  --radius-chip: 6px;
  --space-unit: 4px;
}
```

Rules:
- **One accent per screen.** The blocked stage is the only red thing on the diagnosis screen.
- No gradients except a single 1px top hairline on cards. No shadows deeper than
  `0 1px 2px rgb(18 32 58 / 0.06)`.
- Dark mode is out of scope; ship light only, and say so.

## 3. Typography

| Role | Face | Usage |
|------|------|-------|
| Display | **Bricolage Grotesque** (variable, Google Fonts) | Page headlines, verdict sentence, rail stage numbers |
| Body | **IBM Plex Sans** + **IBM Plex Sans Devanagari** | All body copy, questions, answers, artifacts |
| Utility / data | **IBM Plex Mono** | Case tokens, application IDs, reference numbers, amounts, dates |

Plex is chosen because it has a matched Devanagari family — Hindi output must not fall back to a
different-looking font mid-sentence. Load via `next/font/google` with `display: swap` and subset
`latin, devanagari`.

Scale (rem, 16px base): `12 / 14 / 16 / 18 / 22 / 28 / 40`. Body is 18px on mobile (not 16 — this is read
under stress on cheap screens), 16px minimum anywhere. Line height 1.55 for body, 1.15 for display.
Max measure 68ch.

Weights: display 600 only; body 400 and 600 only. Never use italic for emphasis in Devanagari.

## 4. Components

### 4.1 `<JourneyRail />` — the signature

Vertical on mobile, vertical on desktop too (it reads as a ledger, not a stepper). Eight stages:

```
1  Application submitted
2  College verification
3  State / ministry verification
4  Sanction issued
5  Payment instruction sent
6  Payment system processing
7  Aadhaar-to-bank routing
8  Credit to your account
```

Each stage row: `[marker] [stage name] [status word] [provenance badge]`, plus an optional one-line note.

| Status | Marker | Colour | Line to next stage |
|--------|--------|--------|--------------------|
| `CONFIRMED` | filled circle with tick | `--color-confirmed` | solid |
| `LIKELY` | filled circle, no tick | `--color-ink-soft` | solid |
| `UNKNOWN` | hollow circle | `--color-unknown` | **dashed** |
| `BLOCKED` | square with a break in the spine | `--color-blocked` | solid above, broken below |
| `NOT_REACHED` | small hollow dot | `--color-line` | dashed |

The dashed line is the honesty device: it says *nobody can see this from here*. Never render an unknown
stage as confirmed.

Props: `stages: {id, label, status, provenance, note?}[]`, `compact?: boolean`.

### 4.2 `<ProvenanceBadge />` — required, everywhere

Four variants, small caps, 12px, `--radius-chip`, 1px border, no fill except the note variant:

| Variant | Label | Border colour | Tooltip |
|---------|-------|---------------|---------|
| `PUBLIC_RULE` | Public rule | `--color-note` | "From publicly documented scheme or banking rules." |
| `SIMULATED` | Demo record | `--color-unknown` | "From this prototype's synthetic records. Not a real government record." |
| `USER_STATED` | You told us | `--color-slate` | "You entered this." |
| `AI_INFERENCE` | Our estimate | `--color-slate` | "Worked out from what you told us. It can be wrong." |

TypeScript must make this non-optional: any component rendering a fact takes `provenance` as a required
prop. See `safety-and-honesty.md` §3.

### 4.3 Other components

| Component | Notes |
|-----------|-------|
| `<DisclosureStrip />` | Fixed top, 32px, `--color-ink` background, white 13px text, never dismissible |
| `<QuestionCard />` | One question, 2–4 `<AnswerButton>` (min-height 56px, full width on mobile), plus "I don't know" and "Skip" as text buttons |
| `<ConfidenceChip />` | Three states only: `Fairly confident`, `Possible`, `Not enough information yet` |
| `<KnowUnknowList />` | Two-column on desktop, stacked on mobile; the unknown column always has ≥1 item |
| `<ActionStep />` | Numbered, with Do this / Where / Take with you / What to expect / Typical time, checkbox |
| `<ArtifactPaper />` | White panel, 1px `--color-line`, 32px padding, Plex Sans, `[[placeholder]]` tokens highlighted amber |
| `<FallbackBanner />` | Amber strip under the disclosure strip when the model is unavailable |
| `<CopyLinkRow />` | Case URL + copy button + "There is no login. This link is your case." |
| `<EventRow />` | Timeline entry: time, actor chip, description |

### 4.4 Buttons

- Primary: `--color-confirmed` fill, white text, 48px min height, `--radius-chip`.
- Secondary: white fill, 1px `--color-line`, `--color-ink` text.
- Destructive/none. There is nothing to destroy.
- Button labels are verbs and stay identical through the flow: "Generate letter" → toast "Letter generated".

## 5. Motion

Total motion budget: three things.
1. Rail stages fade+rise in sequence (60ms stagger, 240ms each) once, on diagnosis reveal.
2. Question cards cross-fade (160ms).
3. Checkbox tick (120ms).

All wrapped in `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`.

## 6. Copy rules

- Sentence case everywhere. No title case headings.
- Short sentences. Target Grade 8 readability in English.
- Gloss every system word on first use: *"PFMS-type payment system (the system that actually sends the
  money)"*. After the first gloss, use the short form.
- Never write "kindly", "do the needful", "as per", "leverage", "seamless", "empower".
- Errors state what happened and the one thing to do. They do not apologise.
- Never say "your file is at desk X" or anything implying we can see inside a government office.
- Hindi copy is a real translation, not transliteration, and is reviewed for the artifact templates
  (which are the ones that get sent to officials).

## 7. Accessibility (hard requirements)

- WCAG 2.1 AA contrast for all text and for rail markers against `--color-paper`.
- Every interactive element reachable by keyboard with a visible 2px `--color-note` focus ring.
- The rail is a `<ol>` with `aria-label="Payment journey"`; each stage announces
  `"Stage 6 of 8, payment system processing, status unknown"`.
- Live regions: diagnosis result and verification result announce via `aria-live="polite"`.
- Form errors are associated with inputs via `aria-describedby`.
- Touch targets ≥ 44×44px, primary ≥ 48px.
- Test with 200% browser zoom at 360px width: no clipping, no horizontal scroll.
- Images (uploads) get `alt` from filename; decorative marks are `aria-hidden`.

## 8. Performance / low bandwidth

- No images in the core flow except the user's own upload preview (rendered from an object URL, never
  re-downloaded).
- Fonts: two families, `swap`, preloaded, subset. Everything else system.
- Route-level code splitting; the diagnosis engine runs server-side, so no rules bundle ships to the client.
- Target: LCP < 2.0s on Slow 4G, JS < 150KB gzipped on the intake route.
- All pages render usable HTML without client JS except the upload widget and inline editing.

## 9. Mobile specifics

- Single column below 640px, 16px gutters.
- Primary CTA sticky at the bottom with a 12px safe-area inset.
- The rail's stage labels wrap to two lines rather than truncating.
- Textareas start at 6 rows and auto-grow; the keyboard must not cover the submit button (scroll into
  view on focus).
