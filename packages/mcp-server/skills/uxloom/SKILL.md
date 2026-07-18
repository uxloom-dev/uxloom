---
name: uxloom
description: Validates UI/UX designs with UXLoom — models user journeys as state machines and proves what screens are missing (unreachable states, dead ends, empty/loading/error coverage, WCAG contrast, touch targets, localization overflow) before code exists. Use when designing screens or user flows, validating AI-generated UI, reviewing designs for production readiness, or when the user mentions UXLoom, user journeys, screen states, or design QA.
---

# UXLoom — journey-first design validation

UXLoom is the critic; you are the designer. It runs deterministic checks over
design-as-data: same input, same report. Your job is to build the JourneyGraph
honestly and iterate until the report is clean.

## Core rules

1. **Never design a screen outside a journey.** Every screen exists because a
   journey state needs it. Define the journey first.
2. **The contract must be honest.** Every screen's requiredStates includes
   empty, loading, and error states — or carries an exemption with a written
   reason when a state genuinely cannot apply. Never leave a baseline state
   both missing and unexplained. A weak contract passing validation is worse
   than a strong contract failing it.
3. **Zero errors is the exit condition.** Findings are not suggestions.
4. **Answer the brief yourself first.** Only relay `askHuman: true` questions
   to the user; report the assumption ledger back in one short paragraph.

## Workflow

Copy this checklist and check off items as you complete them:

```
UXLoom Progress:
- [ ] 1. uxloom:project_init (name + platforms)
- [ ] 2. uxloom:brief_start → answer from context → uxloom:brief_answer
- [ ] 3. uxloom:journey_define for each journey (failure events included)
- [ ] 4. uxloom:screen_register for each screen (honest contracts)
- [ ] 5. uxloom:project_validate → fix every error → re-run until 0 errors
- [ ] 6. uxloom:coverage_report → include its headline in your summary
```

**When a PRD, spec, or design doc exists**: pass its contents as the
`context` argument of uxloom:brief_start and extract every answer from it —
do not re-ask the user what their documents already state.

**When registering a complete design** (or converting an existing one):
build the whole document and use uxloom:project_import in one call instead
of many journey_define/screen_register calls. Steps 3–4 remain the right
shape when designing incrementally.

**Step 3 — journeys.** Every non-final state has outgoing events including
failure events (`ERROR`, `OFFLINE`, `CANCEL`, `BACK`). Failure events target
`state#error.<kind>` refs. Every journey has at least one final state.

**Step 4 — screens.** Include in each screen:
- `requiredStates` (the contract) and `designedStates` (progress so far)
- `components` with `fg`/`bg` hex for text, `minTargetPx` + `interactive: true`
  for tappables, `label` with `maxChars` for space-constrained text
- `exemptions` with written reasons for inapplicable baseline states
  (`{ "state": "error.any", "reason": "..." }` exempts the error family)

**Step 5 — the validation loop.** Run uxloom:project_validate. For each
finding, apply its `fix`, then re-run. Use uxloom:screen_critique while
iterating on one screen. Only stop when errors = 0; resolve warnings or
exempt them with reasons.

## Validating screens from generators

When screens come from v0, Lovable, Figma Make, or your own generation:
extract each screen's intent, states, and key components (colors, target
sizes, labels), register them, and let the critics find what generation
skipped. Surface the gap list to the user, then design the missing states.

## CLI alternative (no MCP session)

`npx uxloom check [file]` validates a project file directly — exit 1 on
errors. Use in CI or when the MCP server is not connected.

## Showing the design to the human

Suggest the user runs `npx uxloom preview` in a terminal: a local page
renders live wireframe mocks of every screen — every contracted state
(loading skeletons, empty placeholders, error banners, custom-state
overlays are derived automatically), every viewport, with clickable
journey events — and updates in real time as you design. For richer
mocks, give screens a `layout` (ordered semantic blocks: header, nav,
hero, text, list, card, form, field, button, image, table, footer);
screens without one auto-derive a layout from their components.

## Implementing from the contract

When writing the actual UI code for a contracted screen, emit
`data-ux-screen` / `data-ux-state` markers where each state renders, then
verify with uxloom:project_audit — the code stays self-auditing. Details:
[references/audit.md](references/audit.md).

## Reference

- **JourneyGraph format** (fields, target refs, exemptions): see [references/format.md](references/format.md)
- **Critics, finding codes, and thresholds**: see [references/critics.md](references/critics.md)
- **Implementation audit** (markers, registry, drift): see [references/audit.md](references/audit.md)
- **Worked example** (checkout journey, before/after): see [references/examples.md](references/examples.md)
