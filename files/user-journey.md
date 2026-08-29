# User Journey and Screens

## 0. The journey in one line

```
INPUT → UNDERSTAND → ASK → DIAGNOSE → ACTION → GENERATE → VERIFY → RESOLVE or ESCALATE
```

Mapped to routes:

| Stage | Route | Case state on entry |
|-------|-------|---------------------|
| INPUT | `/start` | — |
| UNDERSTAND | `/case/[token]` (auto) | `INTAKE` → `EXTRACTED` |
| ASK | `/case/[token]/questions` | `QUESTIONING` |
| DIAGNOSE | `/case/[token]/diagnosis` | `DIAGNOSED` |
| ACTION | `/case/[token]/actions` | `ACTION_PLANNED` |
| GENERATE | `/case/[token]/artifact/[artifactId]` | `ACTION_PLANNED` |
| VERIFY | `/case/[token]/verify` | `AWAITING_VERIFICATION` → `VERIFYING` |
| RESOLVE / ESCALATE | `/case/[token]/timeline` | `RESOLVED` / `ESCALATED` / `NEEDS_MORE_INFO` |

Full state machine in `workflows.md`.

---

## 1. `/` — Landing

**Job:** in one screen, make a student recognise their own situation and press one button.

Sections, in order:

1. **Disclosure strip** (fixed, top, on every route):
   `Independent prototype — not an official government service. Demo data only.`
2. **Hero.** Headline: *"Your scholarship says approved. The money hasn't come."*
   Sub: *"Find out which step is actually stuck, and what to do about it — in about five minutes."*
   Primary button: **Check my case** → `/start`. Secondary: **See a demo case** → `/demo`.
3. **Signature element: the Payment Journey Rail** (see `ui-ux.md` §4.1) rendered in its "unknown"
   state — eight stages, six of them dashed and grey, with the caption
   *"This is what you can see today. Only the first two stages are visible on the portal."*
4. **Three plain-language symptom cards** (each is a link that pre-fills intake):
   - "Status says sanctioned, nothing in my account"
   - "College says it's approved, portal says under process"
   - "Money came for my friend, not for me"
5. **What this does / does not do.** Two short columns, verbatim from `product.md` §3.
6. **Footer:** About, Honesty & limitations, Source of rules, Demo cases.

No carousel. No animation beyond a single 400ms fade of the rail on load, disabled under
`prefers-reduced-motion`.

---

## 2. `/start` — Create a case (anonymous)

Single scrolling page, no wizard chrome. Creates the case on first submit, not on page load.

**Block A — "Tell us what's happening"** (required, one of the three, any combination):
- Large textarea, placeholder: *"e.g. My post-matric scholarship shows sanctioned since December but
  nothing has come to my account. My college says it's done from their side."*
  Min 15 characters to enable submit.
- **Paste portal status** — a second textarea labelled *"Paste exactly what the portal shows (optional)"*.
- **Upload a screenshot** — drag/drop + file picker. `.jpg .jpeg .png .webp`, max 5 MB, max 3 files.
  Helper: *"We read the text in the image and then discard the image. We never store your screenshot."*

**Block B — "A few basics"** (all optional, all skippable):
- Scheme type (select): Pre-Matric / Post-Matric / Merit-cum-Means / Top Class / State scheme / Not sure
- Academic year (select, last 3 years + Not sure)
- Portal (select): National portal / My state's portal / Not sure

**Block C — Consent + privacy**
- Checkbox, unchecked: *"I understand this is a demo prototype using synthetic data."* Required.
- Static note: *"Do not enter your Aadhaar number, full bank account number, or any OTP. We will remove
  them if you do."*

**Submit:** `Start my case` → `POST /api/cases` then `POST /api/cases/{token}/intake` → redirect to
`/case/[token]`.

**Client-side redaction before send:** strip 12-digit Aadhaar-shaped strings, 9–18 digit account-shaped
strings, and 6-digit OTP-shaped strings; replace with `[removed]` and show an inline toast
*"We removed a number that looked like an Aadhaar or account number."* Server repeats this (see
`safety-and-honesty.md`).

---

## 3. `/case/[token]` — Understanding (case shell)

The token is saved to `localStorage.saathi_cases` (array of `{token, createdAt, label}`) so the student
can return. A visible **"Save this link"** row shows the URL with a copy button and the line
*"This link is the only way back to your case. There is no login."*

**On state `INTAKE`:** loading screen with the four-step progress list
(`Reading what you wrote` → `Reading your screenshot` → `Pulling out the facts` → `Working out what to ask`),
each ticking as the server-sent stages complete. Skeleton, never a bare spinner. Max 25s, then error state.

**On state `EXTRACTED`:** the **"What we understood"** card:
- A two-column list of extracted fields with values and a provenance badge on each
  (`You told us` / `From your screenshot` / `Our estimate`).
- Every field is editable inline (pencil icon → input → save). Editing a field sets its provenance to
  `You told us` and re-runs question selection.
- Fields we could not extract are listed under *"We could not find"* with a plain description.
- Primary button: **Continue** → `/case/[token]/questions`.

---

## 4. `/case/[token]/questions` — Adaptive questions

- **One question per screen.** Progress reads *"Question 2 — usually 3 to 5 in total"*, never a fake
  percentage.
- Each question shows: the question in plain language, 2–4 large tappable answer buttons, and always
  **"I don't know"** and **"Skip"**.
- Under each question, a collapsed disclosure: *"Why we're asking"* → one sentence naming which two
  possibilities this separates. (e.g. *"This tells us whether the payment was never sent, or was sent
  and bounced back."*)
- Some questions include a **"How to check this"** panel: numbered steps to find the answer
  (e.g. how to check bank seeding status, how to ask the bank counter). Written from public rules only,
  badged `Public rule`.
- After each answer: `POST /api/cases/{token}/answers` → server returns either the next question or
  `{done: true}` → redirect to diagnosis.
- Stopping rules (deterministic, in `workflows.md`): stop at confidence ≥0.65 with a ≥0.25 gap, or after
  5 questions, or when no remaining question changes the ranking.
- Back button re-opens the previous question and allows changing the answer; changing an answer
  invalidates all later answers and re-runs selection.

---

## 5. `/case/[token]/diagnosis` — Diagnosis

Order on screen matters. Top to bottom:

1. **Headline verdict** — one sentence, plain: *"Most likely, the payment was sent but bounced back
   because your account is not linked to Aadhaar for DBT."* Followed by a confidence chip:
   `Fairly confident` / `Possible` / `Not enough information yet` (never a raw percentage in the headline;
   the percentage is available in the detail row).
2. **The Payment Journey Rail**, filled in: each of the 8 stages marked
   `Confirmed` / `Likely` / `Unknown` / `Blocked here`, each with a provenance badge.
   The blocked stage is the only one with the accent colour.
3. **What we know** — bulleted, each line with source badge.
4. **What we don't know** — bulleted, each line paired with *"How to find out"* (one concrete step).
   This block is **never empty**; if it would be, render *"One thing could still change this answer: …"*.
5. **Other possibilities** — the remaining ranked hypotheses, collapsed, each with: name, plain
   description, confidence, and *"What would prove this"*.
6. **Primary button: See what to do → `/case/[token]/actions`.**
7. Secondary: *"This doesn't match my situation"* → opens a correction form that adds a free-text note,
   re-runs extraction merge, and returns to questions.

If confidence band is `LOW`: the headline becomes *"We can't safely narrow this down yet"*, the top block
becomes the two competing possibilities side by side, and the primary action becomes the single
information-gathering step that separates them. The product must never fabricate certainty here.

---

## 6. `/case/[token]/actions` — Action plan

- Ordered steps, numbered because the order genuinely matters (do step 1 before step 2).
- Each step card contains: **Do this**, **Where**, **Take with you** (document list), **What to expect**,
  **Typical time**, and where relevant a **Generate letter** button.
- Each step has a checkbox: **Mark as done** → `POST /api/cases/{token}/actions/{actionId}/complete`.
- Steps carrying an artifact link to `/case/[token]/artifact/[artifactId]`.
- Bottom: **"I've done these — check my case"** → `/case/[token]/verify` (enabled once ≥1 step is done).
- Persistent side note: *"Nothing here is submitted for you. You send it."*

---

## 7. `/case/[token]/artifact/[artifactId]` — Generated request / grievance

- Rendered document in a bordered "paper" panel, editable in place (contenteditable textarea view).
- Header row: artifact type, intended recipient, and the line *"Draft for you to send. Not submitted."*
- Buttons: **Copy text**, **Download .txt**, **Print / Save as PDF** (uses `window.print()` with a print
  stylesheet), **Switch to Hindi / English**.
- Placeholders that the student must fill are shown as highlighted `[[your name]]` tokens with a
  count-in-context warning: *"3 things still to fill in."* Download is allowed anyway.
- Footer of every artifact body: `Prepared with Scholarship Saathi, an independent prototype.`
- Artifact types: `BANK_DBT_REQUEST`, `BANK_REACTIVATION_REQUEST`, `INSTITUTE_FOLLOWUP`,
  `PORTAL_GRIEVANCE`, `RTI_DRAFT`, `CASE_SUMMARY`. Defined in `workflows.md` §6.

---

## 8. `/case/[token]/verify` — Verification

- Short form: *"What happened when you did it?"* with 3–5 outcome buttons specific to the action taken
  (e.g. *"Bank staff filled the DBT/seeding form"*, *"Bank said it is already linked"*, *"Counter refused"*,
  *"Couldn't go yet"*).
- On submit: `POST /api/cases/{token}/verify` → the server re-queries the **mock** government services,
  computes a new journey state, and returns one of:
  - `RESOLVED` → success screen,
  - `PROGRESSED` → journey rail advances, a new action plan is issued (back to `/actions`),
  - `NO_CHANGE` → offers the escalation ladder,
  - `NEEDS_MORE_INFO` → back to questions with the new gap.
- The verification screen always shows a `Demo record` badge on any status it reports, and the line
  *"In a real deployment this check would call the scholarship and payment systems. Here it reads our
  synthetic records."*

**Resolved screen:** shows the completed rail with all eight stages confirmed, the simulated credit line
(`₹ amount, date, account ending XX99 — Demo record`), a **Download case summary** button, and
*"What to do if it doesn't actually arrive in 7 days"*.

**Escalated screen:** shows the ladder with the current rung highlighted:
`Institute nodal officer → State nodal officer → Portal helpdesk ticket → Scheme ministry grievance →
Public grievance portal → RTI`, plus for bank-side causes:
`Branch → Bank nodal officer → Banking ombudsman`. Each rung generates its artifact and records the date
so the student can prove elapsed time.

---

## 9. `/case/[token]/timeline` — Case history

- Reverse-chronological event feed of every case event (see `database.md` §events): created, extracted,
  each question answered, diagnosis produced, actions issued, artifacts generated, verification results,
  state changes.
- Each entry shows time, actor (`You` / `Saathi` / `Demo government system`) and provenance.
- Buttons: **Download case summary**, **Start over with the same facts** (clones the case).

---

## 10. `/demo` — Demo mode

- Three cards, one per case in `demo-cases.md`, each with: student name (fictional), one-line symptom,
  the expected outcome, and a **Run this case** button.
- **Run this case** calls `POST /api/demo/seed?case=1|2|3`, which creates a case pre-filled with that
  case's intake text and returns its token, then redirects to `/case/[token]`.
- A **Demo mode** chip persists in the header for seeded cases with tooltip *"This case uses a fictional
  student and synthetic records."*
- Each demo case screen shows a small **Judge guide** disclosure: the exact next click and what to look
  for, so a judge cannot get lost.

---

## 11. `/about` — How it works and what we don't know

Sections: the problem; where our rules come from (with source list and the honest note that no national
failure statistic exists); what is real vs simulated; what would be needed for production integration;
the model's role and its limits; privacy; contact/feedback (a `mailto:` link, no form).

---

## 12. Cross-cutting states

**Loading:** every async screen has a skeleton matching final layout. Long AI calls stream progress
labels. Nothing spins with no text.

**Empty:** `/case/[token]` with no evidence → *"We don't have anything to work with yet. Add what the
portal shows, or describe what happened."* with the input controls inline.

**Errors** (each is a component with title, what happened, and one recovery action):
| Code | Message | Recovery |
|------|---------|----------|
| `CASE_NOT_FOUND` | "We can't find this case. The link may be wrong or the demo data was reset." | Start a new case |
| `AI_UNAVAILABLE` | "Our reading assistant is not responding, so we're using our built-in rules instead. You can still finish." | Continue (fallback mode banner) |
| `UPLOAD_TOO_LARGE` | "That image is over 5 MB. Take a screenshot instead of a photo, or crop it." | Retry upload |
| `UPLOAD_UNREADABLE` | "We couldn't read any text in that image." | Paste the status as text |
| `RATE_LIMITED` | "Too many requests from this network. Wait a minute." | Retry with countdown |
| `SERVER_ERROR` | "Something broke on our side. Your case is saved." | Retry / go to timeline |

**Fallback banner:** when the app is running without the model, a persistent amber strip:
*"Running in offline rules mode — answers are based on our built-in rules only."*

**Mobile:** primary actions are full-width and fixed to the bottom on `< 640px`; question buttons are
min 56px tall; the journey rail becomes vertical with stage labels wrapping; no horizontal scroll at
320px width.
