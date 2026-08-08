# RFC 0004 — The frontier release (v0.7.0)

**Status:** Shipping · Closes every deferred item from RFC 0003.

## R8 — `uxloom diff`: human-reviewable design diffs  *(Lane D)*

Semantic diff of two project files (or `--git <ref>` vs working tree):
journeys/screens/states added/removed, transition changes (incl. guards/
roles), contract deltas, token changes, exemption changes. Output: human,
`--json`, `--markdown` (PR-comment ready). A thousand-line JSON diff
becomes ten meaningful lines.

## R9 — Native-platform audit  *(Lane E)*

Marker evidence in Swift/Kotlin/Dart/Java via language-agnostic comment
markers (`// data-ux-screen: X`, `// data-ux-state: y`) and native idioms
(`.accessibilityIdentifier("ux-state:x")`, `Modifier.testTag("ux-state:x")`).
Audit scans native sources; marker-quality heuristics stay conservative on
comment markers (no thin-check — comments can't prove emptiness; static-
render check still applies). The web-only audit asterisk is gone.

## R10 — Audit tier 4 (live DOM) + PNG export  *(Lane F, optional Playwright)*

- `uxloom audit --live <baseUrl>`: loads each screen's route
  (`uxloom.map.json` gains optional `route`), verifies `data-ux-screen`
  presence and that marked state elements exist in the real DOM
  (default-visible states verified as rendered; others as present).
  Verdict tier "dom-verified" with honest labeling.
- `uxloom export --png <dir>`: renders every screen×state to PNG via the
  standalone HTML. Both features degrade gracefully with an install hint
  when Playwright is absent — the core stays zero-dependency.

## R11 — Accessibility pack v1  *(Lane MAIN)*

Only honestly-checkable-at-design-time rules, no checkbox theater:
- `unlabeled-interactive` (warning): interactive component with no label —
  screen-reader users get nothing.
- Large-text contrast: `textRole: "large"` components check at 3:1
  (completing WCAG 1.4.3 properly instead of over-flagging display text).
- `motion-fallback` (warning): `motion: "decorative"` components must
  honor prefers-reduced-motion; `"essential"` documents intent.

## R12 — Interaction-behavior specs  *(Lane MAIN + G renders)*

Fields: `validation { required?, pattern?, message? }`. List/table blocks:
`sort`, `filter` (column lists). Documented intent for codegen; rendered
as chips in the preview.

## R13 — Designer authoring: structured edit mode  *(Lane G)*

In the preview: edit tokens, edit block copy/labels inline, reorder/add/
remove blocks, all POSTed to the server which writes the project file —
the same file agents edit, watched live. Authoring without a canvas:
designers manipulate the same source of truth, in design terms.

## R14 — Figma/Penpot bridge via SVG  *(Lane G)*

`uxloom export --svg <dir>`: one SVG per screen×state, faithful to the
wireframe/theme renderer. Figma and Penpot import SVG natively — the
bridge that works today with zero API coupling.

## R15 — Real docs site  *(Lane MAIN)*

uxloom.dev/docs: generated from the repo's own markdown (QUICKSTART, skill
references, RFCs) by a zero-dep generator run in release-prep — docs can
never drift from the shipped truth.

## Still not engineerable

Ecosystem maturity (users, adoption, bus factor) — only distribution and
time. Recorded, unbuildable.
