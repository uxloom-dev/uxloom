# Design intelligence — the evidence-based design process

## Contents
- The principle
- Phase 1: research protocol
- Phase 2: decision framework
- Phase 3: recording rationale
- Phase 4: the review loop (max 3 rounds, enforced)
- Phase 5: the confidence report
- Citation discipline

## The principle

Users often don't know what they want, and a design with no argument
behind it is a guess wearing a suit. Your job is to make every major
decision **defensible**: researched, compared against alternatives, and
recorded in the contract so the user can inspect the why. UXLoom enforces
this once adopted (`rationale-missing` / `rationale-thin` findings) and
bounds the iteration (`uxloom:design_review`, max 3 rounds).

## Phase 1: research protocol (before designing anything)

1. **Classify the product** — category, primary persona, platform norms.
2. **Scan the market**: identify 3–5 established products in the category.
   Use live web research when you have it; otherwise ground yourself in
   [references/patterns.md](patterns.md) — curated conventions from
   published usability research.
3. **Extract conventions**: for this category, what do users already know?
   Navigation model, IA depth, critical flows, expected states, trust
   signals, conversion patterns. Convention is a *default with evidence* —
   users bring habits from every other product they use.
4. **Note deliberate-divergence candidates**: where might breaking
   convention serve this product's specific goal? Divergence is allowed;
   *unargued* divergence is not.

## Phase 2: decision framework (for every major decision)

Major decisions: information architecture, navigation model, each
journey's shape, each key screen's layout pattern, color direction,
density/tone. For each:

1. Generate **at least two genuine alternatives** (three for IA and
   navigation). "Genuine" = you could defend shipping either.
2. Compare against fixed criteria: user's primary goal on this screen ·
   category convention (match or argued divergence) · platform norms
   (HIG/Material/web) · accessibility cost · implementation cost ·
   localization risk.
3. Decide, and record honestly — including what the rejected option did
   *better* (its pros). A comparison where the loser has no pros is
   theater, and the critic will flag it.

## Phase 3: recording rationale

Attach `rationale` to the project (IA/brand direction), every journey
(flow shape), and every screen (layout/pattern choice):

```json
"rationale": {
  "decision": "Single-column checkout with progress indicator",
  "reasoning": "Checkout is a completion task, not a browsing task: the category convention is a distraction-free linear flow with visible progress. Multi-column layouts increase field-scanning errors on mobile, and this product is mweb-first.",
  "alternatives": [
    { "option": "Two-column with persistent cart summary",
      "pros": ["cart always visible", "fewer scrolls on desktop"],
      "cons": ["competes for attention with form fields", "collapses poorly to mobile", "diverges from category convention without a driving reason"] }
  ],
  "sources": ["https://baymard.com/blog/checkout-flow-average-form-fields"],
  "confidence": "high"
}
```

## Phase 4: the review loop (max 3 rounds — the tool enforces this)

After the design validates clean, call `uxloom:design_review`. It returns
a six-line rubric (completeness, evidence, consistency, market fit,
accessibility, honesty), your rationale coverage, and the delta since the
last round. Critique the design against **every** rubric line, fix what
you find, call again. Three rounds maximum; the tool refuses a fourth —
at that point diminishing returns are real and the user's judgment beats
another self-review. Do not game the loop by making trivial rounds.

## Phase 5: the confidence report (what the user receives)

End with a structured summary the user can trust:
- **Decisions**: each major choice in one line, with confidence level.
- **The road not taken**: rejected alternatives and why — this is what
  makes the user trust the chosen path.
- **Market grounding**: which conventions were followed, which were
  deliberately broken, and the argument for each break.
- **Sources**: every factual claim's citation; judgment calls labeled as
  judgment.
- Remind the user: every rationale is also in the preview (ⓘ) and in
  exports — stakeholders see the evidence, not just the pixels.

## Citation discipline (non-negotiable)

- **Never fabricate statistics.** No invented percentages, no fake study
  names. Cite research bodies (Baymard Institute, Nielsen Norman Group,
  platform HIGs) for the *qualitative conventions* they actually document,
  or real URLs you actually found in live research.
- A claim without a source is a **judgment call** — label it as one and
  set confidence accordingly. Honest "medium confidence, judgment" beats
  fake authority every time.
