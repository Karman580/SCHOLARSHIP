# Scholarship Saathi — Implementation Specification

**Build What Moves India submission. This folder is the source of truth for Claude Code / Codex.**

Scholarship Saathi is a public, no-login web app that helps a student whose government scholarship is
**sanctioned but unpaid** find out *which stage of the payment journey is actually blocked*, what to do
about it, and generate the exact letter, grievance or RTI needed to unblock it.

It is an **independent prototype**. It connects to **no** live government, banking, Aadhaar, PFMS or NPCI
system. Every government record in the app is synthetic and labelled as such.

---

## Read the docs in this order

| # | File | What it settles |
|---|------|-----------------|
| 1 | `product.md` | The citizen problem, evidence, scope, what we will and won't claim |
| 2 | `user-journey.md` | Every screen, every state, every transition, screen by screen |
| 3 | `ui-ux.md` | Design system: palette, type, components, copy rules, accessibility, mobile |
| 4 | `architecture.md` | Stack, folder structure, module boundaries, data flow, env vars |
| 5 | `database.md` | Full schema DDL, types, indexes, repository API, in-memory fallback |
| 6 | `backend.md` | Every API route: method, path, request schema, response schema, errors |
| 7 | `ai.md` | Every OpenAI call: prompt, JSON schema, temperature, fallback behaviour |
| 8 | `workflows.md` | The state machine, the rules engine, hypotheses, actions, escalation ladder |
| 9 | `mock-government-systems.md` | Synthetic NSP / PFMS / NPCI / Bank services and their seed data |
| 10 | `demo-cases.md` | Three complete click-through demo cases with expected output at each step |
| 11 | `testing.md` | Unit, integration, e2e, accessibility and manual test matrix |
| 12 | `deployment.md` | Local setup, env, seeding, Vercel deploy, troubleshooting |
| 13 | `safety-and-honesty.md` | Disclosure rules, provenance labelling, prohibited claims, data handling |

---

## Non-negotiables

1. **No login.** A case is reachable by an unguessable URL token. Nothing else gates access.
2. **The AI never invents a government state.** The model extracts, questions, explains and drafts.
   A deterministic rules engine decides case state, hypotheses, confidence and transitions.
   See `ai.md` §"Division of responsibility" and `workflows.md` §"Rules engine".
3. **Every fact on screen carries a provenance badge**: `Public rule`, `Demo record`, `You told us`,
   `Our estimate`. Implemented as a required field, not a decoration. See `safety-and-honesty.md`.
4. **The journey must complete.** A judge must reach `RESOLVED` or `ESCALATED` from a cold start in
   under four minutes without typing a single real personal detail.
5. **Fallback mode must work.** With `OPENAI_API_KEY` unset the app still completes all three demo
   cases using deterministic parsing and templates, with a visible banner saying so.
6. **Uploaded images are never stored.** Only model-extracted text is persisted. See `backend.md` §Uploads.

## Quickstart

```bash
pnpm install
cp .env.example .env.local        # fill OPENAI_API_KEY (optional), DATABASE_URL (optional)
pnpm db:push                      # no-op if DATABASE_URL unset -> in-memory store
pnpm seed                         # loads mock government records + 3 demo cases
pnpm dev                          # http://localhost:3000
pnpm test && pnpm test:e2e
```

## Definition of done

- [ ] `/` loads in under 2s on a throttled 3G profile and explains the problem in one screen.
- [ ] `/demo` runs all three cases end to end, each ending in a changed mock backend state.
- [ ] A free-text case ("my scholarship is approved but no money") reaches a ranked diagnosis with
      an explicit "What we don't know" block.
- [ ] Every generated artifact is downloadable and copyable and carries the prototype disclaimer.
- [ ] Killing the OpenAI key does not break any of the above.
- [ ] `pnpm test:e2e` green on Chromium desktop + Pixel 5 viewport.
- [ ] Deployed on a public URL with no auth wall.

## Codex / Claude Code involvement

The challenge requires the coding agent to be meaningfully involved. Record it: keep
`docs/build-log.md` (created during the build, not specified here) listing each module the agent
generated, each spec section it was pointed at, and any place where it deviated from this spec and why.
That log is submission evidence, not decoration.
