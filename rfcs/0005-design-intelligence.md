# RFC 0005 — Design intelligence: evidence-backed decisions (v0.8.0)

**Status:** Shipping · **Source:** owner requirement 2026-08-08

## Problem

Users often don't know what they want; generators answer with arbitrary
fixed choices (layout, colors, copy) and no justification. Confidence
requires *evidence*: what was considered, why this won, what the market
does, and where the claims come from.

## Architecture principle

Intelligence is the agent's job; **verifiability is UXLoom's job.** The
tool doesn't pretend to do market research — it makes the agent's research
inspectable, enforceable, and iterated. Division of labor:

| Layer | Owner | What it does |
|---|---|---|
| Rationale format | schema | Every decision carries reasoning, alternatives (pros/cons), sources, confidence |
| Rationale critic | critics | Undocumented decisions and decision-theater ("thin" rationale, no alternatives) are findings |
| `design_review` tool | MCP server | Iterative review rounds, max 3, persisted with deltas — the loop is enforced, not hoped for |
| Design-intelligence skill | skill | The research protocol: category → market leaders → pattern conventions → alternatives → decision → citation |
| Pattern library | skill reference | Curated, citation-grounded market conventions per product category (works offline; live web research supplements) |
| Rationale UI | preview/export | ⓘ per screen and project: the full evidence panel end users actually see |

## R16 — Rationale in the format

`rationale?: { decision, reasoning, alternatives?: [{option, pros[], cons[]}], sources?: string[], confidence?: "low"|"medium"|"high" }`
on Project (IA/brand direction), Journey (flow shape), and Screen (layout/
pattern choice). Strict schema; additive.

## R17 — Rationale critic (adoption-gated, like markers)

Fires only when the project has opted in (any rationale present, or
`uxloom.config.json: { "rationale": "required" }`) — no noise for quick
sketches, full enforcement once a team adopts evidence-based design:
- `rationale-missing` (warning): screen/journey with no rationale
- `rationale-thin` (warning): reasoning under 60 chars, or no compared
  alternative with at least one pro AND one con — decisions must be
  *argued against something*, or they're theater
- Summary: rationale coverage (documented / total decisions) in check
  output and reports.

## R18 — `design_review`: the iterative loop, enforced

MCP tool. Each call = one review round: computes validation + rationale
coverage, persists to `<project>.reviews.json`, returns a structured
rubric (completeness, evidence, consistency, market fit, accessibility,
honesty) plus the delta vs the previous round. **Round 4 is refused** —
"present results to the user; further iteration needs their direction."
Iteration becomes auditable history, not vibes.

## R19 — The skill: research protocol + pattern library

- `references/design-intelligence.md`: the full process — category
  identification, market-leader scan (live web research when the agent
  has it), alternative generation (always ≥2 per major decision),
  decision criteria (user goals, platform norms, accessibility,
  implementation cost), citation discipline (no fabricated statistics —
  cite research bodies and observed conventions, or mark as judgment),
  the max-3 review loop, and the final confidence report to the user.
- `references/patterns.md`: curated conventions per category (e-commerce,
  SaaS, onboarding, content, messaging, booking) grounded in published
  usability research (Baymard, Nielsen Norman Group, HIG, Material) —
  qualitative conventions only, no invented numbers.

## R20 — Rationale surfaces to humans

Preview: ⓘ toggle reveals the evidence panel per screen and for the
project — decision, reasoning, alternatives table, sources as links,
confidence chip. Included in `export` (stakeholders see the why) —
this IS the user-confidence deliverable.

## Non-goals

The tool never generates rationale content itself (that would be
fabrication-by-default); no scraping/API integrations; no numeric market
stats unless the agent cites a real source.
