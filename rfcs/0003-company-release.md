# RFC 0003 — The company release (v0.6.0)

**Status:** Shipping · **Source:** external-reviewer critique (2026-08-08)

Every drawback from the review maps to a requirement below. Requirements are
grouped into three independent build lanes with strict file ownership.

## R1 — Brownfield adoption: baseline + config  *(review §6, ranked #1)*

- `uxloom.config.json` next to the project file: configurable thresholds
  (contrast ratio, localization expansion factor, per-platform touch-target
  minimums). Defaults unchanged. Unknown keys rejected.
- `uxloom.baseline.json`: fingerprinted findings (check and audit sections)
  that are acknowledged debt. Baselined findings are reported as a count,
  never fail the run. `--update-baseline` freezes current findings.
  The ESLint/Ruff adoption model: freeze today's debt, block only new drift.

## R2 — Themed preview + shareable export  *(review §1/§10, ranked #2)*

- Project-level `tokens` (colors: accent/bg/surface/text/muted, radius,
  font): the preview applies them — branded mocks, not gray boxes, the
  moment the design system is declared. Absent tokens → current wireframe.
- `uxloom export [file] [--out path]`: one self-contained static HTML file
  (embedded data, no server) — email it, host it, put it in a deck.
  Stakeholders need a link, not npx.

## R3 — Designer feedback loop  *(review §2, ranked #3)*

- Comment mode in the preview: click a location on any screen/state, leave
  a note; pins render on the mock; comments persist to
  `<project>.comments.json`; resolve from the UI.
- Open comments surface in `uxloom check` as `reviewer-comment` warnings —
  designer feedback enters the same loop agents already iterate on.
  Designers become participants with veto power, not spectators.

## R4 — CI-native reporters  *(review §7, ranked #4)*

- `check` and `audit` gain `--json` (stable machine schema), `--sarif`
  (SARIF 2.1.0 for GitHub code scanning), `--github` (workflow-command
  annotations). Human output unchanged by default.

## R5 — Anti-marker-washing (audit tier 2.5)  *(review §5, ranked #5)*

- Static marker-quality analysis: thin markers (element carries the marker
  and nothing else), duplicate markers (one element claiming states it
  cannot distinguish), statically-rendered "conditional" states (marker not
  under any conditional rendering signal). Heuristics report warnings with
  evidence — they never upgrade a verdict, only challenge one. Honest
  labels: this narrows washing; tiers 4–5 (fixture/browser) remain future.

## R6 — Richer content contracts  *(review §3, ranked #6)*

- Blocks gain `columns` (tables), `copy` (real text, not just labels),
  `source` (named data binding). Screens gain `data` (named field→type
  shape). The contract now carries what implementers actually fight about.

## R7 — Flows that match reality + team-scale format  *(review §6/§11, #7)*

- Transitions accept object form `{ target, guard?, roles? }` — conditions
  and role-variants are expressible and render in the preview.
- Journeys accept `platforms` — divergent mobile/desktop flows are separate
  journeys scoped honestly.
- `include` globs in the project file merge fragment files
  (`{journeys?, screens?}`) — teams split the design across files; duplicate
  ids across files are errors; MCP writes go to the base file.

## Explicitly deferred (recorded, not hidden)

From the review's broader sections, consciously open after v0.6:

- **Figma/Penpot bridge, drag-editing canvas** — designers can now review
  with veto power (comments); authoring remains agent/file-driven
- **PNG/PDF export** — needs a browser dependency; static HTML covers
  sharing today
- **Audit tiers 4–5** (fixture rendering, browser verification) and
  **native-platform audit** (SwiftUI/Compose markers) — tier 2.5
  heuristics narrow washing on web; native audit needs per-platform
  runners
- **Accessibility breadth** (focus order, keyboard navigation, motion) —
  today's critics cover contrast + target size; broader WCAG modeling is
  a design problem, not a threshold
- **Interaction-behavior specs** (sort/filter/validation semantics) —
  guards + data shapes carry intent; full behavior contracts are a format
  evolution
- **`uxloom diff`** (human-reviewable design diffs for PRs) and a real
  docs site — ecosystem maturity items
- ~~Declaration-coverage blindness~~ — **closed in v0.6.1**: the report
  now states how much of the design was actually checkable.

## Lanes and ownership

- **Lane MAIN**: schema/types, config, baseline, reporters, loader
  (includes+comments), critics options, CLI wiring, docs, integration.
- **Lane B (agent)**: `preview.ts`, `preview-template.ts`, new
  `preview-export.ts` — theming, comments UI/API, static export.
- **Lane C (agent)**: new `audit-tier3.ts` (pure functions) + tests +
  `skills/uxloom/references/audit.md` additions.
