# RFC 0001 — `uxloom audit`: design-vs-implementation drift detection

**Status:** Draft · **Informed by:** the first manual field audit of a real
production codebase against a 49-state contract (2026-07-14)

## Problem

A validated contract proves the *design* is complete. Nothing proves the
*implementation* honors it. Today the answer to "does the code actually
render the `parked` state?" is a human reading code. This is the
design/implementation drift problem — reported by 83% of designers, on
every project by 26% — and no shipping tool addresses it. Closing it makes
UXLoom the contract for both sides.

## Verdicts

Per contracted state: `IMPLEMENTED` / `PARTIAL` / `MISSING`, each with
evidence (file:line or rendered proof). PARTIAL is a first-class outcome —
ambiguity (e.g. a generic catch block claimed as `error.network`) gets
surfaced with evidence for adjudication, never forced into a binary.

## Detection ladder (cheap → expensive; a state must *earn* IMPLEMENTED)

1. **Route/screen registry** (checked in, e.g. `uxloom.map.json`:
   screen id → route/component). Eliminates the hardest judgment call
   observed in the field: a contracted screen living at an unexpected
   route under a different name is invisible to any name heuristic.
2. **Static markers**: `data-ux-screen` / `data-ux-state` attributes in
   the implementation turn state presence into a grep. Opt-in convention,
   framework-agnostic, zero runtime cost — the recommended path.
3. **AST heuristics** (tree-sitter/ts-morph): the "conditional ladder"
   idiom (`error ? … : isEmpty ? … : loading ? … : default`) proves
   several states at once; conversely, "API layer models the error code
   but nothing calls it" was the field audit's highest-precision MISSING
   signal.
4. **Forced-fixture rendering**: mount the screen with fixtures that force
   each state; the state must render *distinctly* to pass. Reserved for
   error/destructive/public-page states and anything tiers 1–3 marked
   uncertain.
5. **Browser verification** (Playwright + network interception): the
   expensive tier, for states only reachable through real interaction.

Static evidence alone never grants IMPLEMENTED beyond tier 3; tiers 4–5
exist because "the component file exists" tells you nothing about whether
it renders.

## Interface sketch

```bash
uxloom audit [--map uxloom.map.json] [--tier 3]   # exit 1 on MISSING
```

MCP: `project_audit` returning per-state verdicts + evidence, so agents
can fix drift in the same loop they fix design findings. Findings get
codes (`state-unimplemented`, `state-ambiguous`, `screen-unmapped`)
consistent with the existing critic codes.

## Non-goals

Pixel fidelity, visual regression, and style conformance — other tools do
those. This audits *presence and reachability of contracted states*.

## Open questions

- Marker convention name (`data-ux-state` vs `data-uxloom-state`) and
  whether the skill should instruct agents to emit markers when
  implementing from a contract (it should — contract-driven code becomes
  self-auditing).
- Monorepo/multi-app mapping; native platforms (tiers 1–3 generalize;
  4–5 need per-platform runners).
