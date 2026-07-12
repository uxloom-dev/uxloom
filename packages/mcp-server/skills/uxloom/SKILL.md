---
name: uxloom
description: Validate UI/UX designs with UXLoom — journey completeness, state coverage, WCAG contrast, touch targets, and text-expansion checks via the uxloom MCP server. Use whenever designing screens, defining user flows, or reviewing generated UI for production readiness.
---

# UXLoom — journey-first design validation

UXLoom proves what generated screens are missing before code exists. You (the
agent) design; UXLoom is the critic that keeps you honest.

## Core rules

1. **Never design a screen outside a journey.** Every screen exists because a
   journey state needs it. Define the journey first.
2. **The happy path is the minority of the work.** Every screen's contract
   (requiredStates) must include empty, loading, and error states unless there
   is a written reason it can't have them.
3. **Iterate until zero errors.** project_validate findings are not
   suggestions; fix and re-run until `errors: 0`.
4. **Answer the brief yourself first.** brief_start returns questions — fill
   them from conversation context. Only relay `askHuman: true` questions to
   the user. Assumptions are logged, not hidden.

## Workflow

1. `project_init` — once per product (name + platforms).
2. `brief_start` → answer from context → `brief_answer`. Report the
   assumption ledger to the user in one short paragraph.
3. For each journey, `journey_define` with a full state machine:
   - every state names its screen
   - every non-final state has outgoing events, including failure events
     (`ERROR`, `OFFLINE`, `CANCEL`, `BACK`)
   - failure events target `state#error.<kind>` refs
4. For each screen, `screen_register`:
   - `requiredStates`: the contract — default, empty, loading, error.* as
     applicable
   - `designedStates`: what you have actually designed so far
   - `components`: include `fg`/`bg` hex for text-bearing components,
     `minTargetPx` + `interactive: true` for tappables, and `label` with
     `maxChars` for space-constrained text
5. `project_validate` → fix every error → re-run. Use `screen_critique`
   while iterating on one screen.
6. `coverage_report` → include its headline in your summary to the user
   (e.g. "6 screens registered — 9 required states not yet designed").

## Mapping designs from generators

When screens come from v0, Lovable, Figma Make, or your own generation:
extract each screen's intent, states, key components (with colors and target
sizes), register them, and let the critics find what generation skipped.
The value is the gap list — surface it, then design the missing states.
