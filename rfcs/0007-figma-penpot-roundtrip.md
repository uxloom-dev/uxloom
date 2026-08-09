# RFC 0007 — Figma/Penpot round-trip (file-based, zero-coupling)

**Status:** Implemented on `main` (R26–R29) — pending release · **Source:** owner requirement 2026-08-09

## Problem

Today the bridge is one-way and static: `uxloom export --svg <dir>`
(RFC 0004 R14) emits one SVG per screen×state with editable text, and
Figma/Penpot import them natively. The contract paints pictures, but the
pictures never come back. When a designer opens those frames, reorganizes
them, adds screens, or leaves required states undrawn, nothing flows to the
contract and nothing fails a build. The deferred "Figma/Penpot bridge,
drag-editing canvas" item (RFC 0003) is really this: let the design tool
feed *back into* the contract — without breaking the tool's principles.

## Architecture principle

Same division of labor as always: **UXLoom does not become a design tool
and does not couple to one.** No live API, no plugin, no auth, no network,
no AGPL engine (Penpot was rejected as an engine in RFC 0002 for exactly
this reason). The round-trip runs on **files a designer already exports**
and stays deterministic and zero-dependency, so both directions gate CI.

The elegant core is one shared **naming grammar**:

```
<Journey> ▸ <Screen> / <state>
```

The forward path *writes* this into page/frame/layer names. The reverse
path *reads* it back. Because both directions speak the same grammar, the
structure round-trips losslessly with no API — the export is its own
machine-readable key.

## Requirements

- **R26 — Naming grammar (shared contract).** A single canonical grammar
  maps design structure to contract identity: page/section per journey,
  frame named `<Screen> / <state>`, block layers named by block type and
  label. Defined once, consumed by both R27 and R28. Round-trip identity:
  `parse(name(x)) === x` for every screen×state.

- **R27 — Richer forward export.** `export --svg` lands as *organized*
  design material, not a flat pile:
  - One page/section per journey; frames ordered by journey traversal.
  - Frames named per the R26 grammar; block groups named consistently so a
    designer can promote a repeated block to a component in one step.
  - `--manifest` writes `index.json`: `[{ file, journey, screen, state }]`
    — the deterministic key the reverse path reads first (name-parsing is
    the fallback when a hand-edited file lost its manifest).
  - Fully backward compatible: without `--manifest`, output matches today's
    file set plus the organized naming.

- **R28 — Reverse audit (design coverage).** A new direction consumes a
  design *export file/dir* the designer produces (Figma or Penpot SVG/JSON)
  and diffs it against the contract:
  - Recover screen×state per frame via the manifest, else the R26 grammar.
  - Report missing coverage with an `audit`-family, stable finding set:
    `design-screen-unmapped` (contract screen has no frame),
    `design-state-missing` (screen frame exists, a required state does not),
    `design-frame-unmapped` (frame matches no contract screen — candidate
    for scaffolding). Errors vs warnings follow the existing audit severity
    model; deterministic, `--json`/`--sarif`/`--github` like the code audit.
  - `--scaffold <file>` (optional) emits a draft contract fragment
    (`{ screens }`) for `design-frame-unmapped` frames, so a design-first
    team can bootstrap a contract from an existing file. Never overwrites;
    writes a fragment for human/agent review.

- **R29 — Surfaces (CLI + MCP + parity).**
  - CLI: `uxloom export --svg <dir> [--manifest]`;
    `uxloom audit --design <file|dir> [--scaffold <out>]`.
  - MCP: a `design_audit` tool mirroring `uxloom audit --design`, returning
    the same findings shape as `project_validate`/audit so an agent driving
    only MCP discovers design drift the same way it discovers code drift.
  - Docs parity per the standing rule: skill workflow, format.md, README,
    QUICKSTART, website, llms.txt, MCP README — drift-checked in CI by
    `tools/consistency-check.mjs`.

## Naming grammar (`R26` — shared by exporter and importer)

Every reader/writer follows the same rules so identity survives the trip:

- **Page/section**: the journey `title` (fallback `id`).
- **Frame**: `"<Screen title> / <state>"`, e.g. `"Payment / error.declined"`.
  `state` is the exact required-state key from the contract.
- **Block layer**: `"<index> · <type><: label?>"`, e.g. `"2 · form: Card"`.
- **Parsing**: manifest (`index.json`) is authoritative; the grammar is the
  fallback for files exported/renamed by hand. A frame that matches neither
  a manifest entry nor the grammar is a `design-frame-unmapped` candidate,
  never a silent drop.
- **Determinism**: no timestamps or machine paths inside emitted names or
  the manifest — same contract in, byte-identical structure out (consistent
  with the SHA-256-stable guarantee).

## Non-goals

- **No live API / plugin / auth / network.** The hand-off is file-based and
  pull-driven, exactly like RFC 0006's comment loop — model- and
  tool-agnostic, zero-dependency. If a live plugin is ever wanted, it is a
  separate RFC with real user evidence.
- **No pixel/style round-trip.** As with the code audit (RFC 0001), this
  audits *presence and reachability of contracted states*, not visual
  fidelity, spacing, or color values a designer changed. Other tools do
  visual regression.
- **No Penpot engine embedding** (AGPL-3.0, incompatible with MIT
  distribution) — we read its exported files, we do not link its code.
- **No auto-merge of design edits into the contract.** `--scaffold` emits a
  reviewable fragment; a human or agent adopts it. UXLoom never fabricates
  contract content from a picture.
