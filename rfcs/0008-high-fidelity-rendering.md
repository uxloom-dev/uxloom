# RFC 0008 — High-fidelity rendering: no Figma for product UI

**Status:** Shipped R30, R31 (preview), R34 (export parity), R32 (semantic/structural tokens + light/dark); R33/R35/R36 open · **Source:** owner requirement 2026-08-09

## Problem

UXLoom renders the contract as **low-fidelity grayscale block wireframes**
(preview HTML + SVG/PNG export). That's perfect for *validation*, but it
means a team still opens Figma to see and ship real product UI. The goal
now is explicit: **push the output quality so high that a team does not
need Figma for product UI.** The contract already holds tokens, layout
blocks, components, real copy, table columns, and data shapes — the
renderer simply under-uses them.

## Scope discipline (what this is NOT)

This is product-UI fidelity, not a creative suite. Explicit non-goals,
recorded so the wedge stays sharp:

- **No freeform canvas / direct manipulation.** Authoring stays
  agent/file-driven; the contract is the source of truth.
- **No marketing/brand/illustration/print** (Canva's domain).
- **No external asset fetching** — no CDN fonts, remote images, or icon
  services. Zero-dependency and offline-deterministic stay non-negotiable.
- **No non-deterministic generation.** Any sample/placeholder content is
  derived from stable inputs (never `Math.random`), so byte-stability holds
  wherever rendering feeds a checked artifact.

## Principles

1. **Fidelity from the contract, not fabrication.** Richer rendering is
   driven by declared tokens/blocks/components/copy/columns/data. Where a
   mock needs filler (a list row's name, a table cell's value), it uses
   **clearly-generic, deterministic sample content** — the same role gray
   bars play today, just legible. It never invents product copy or design
   decisions (consistent with RFC 0005's anti-fabrication stance).
2. **Deterministic & zero-dependency.** No randomness, no network, no new
   runtime deps. Sample content is a pure function of (block, index,
   column, screen).
3. **Token-driven and themeable.** Every visual property resolves from the
   project's tokens; a project restyles globally by changing tokens.
4. **One design system, two renderers.** The HTML preview leads; the
   SVG/PNG exporters converge to the same look so exports match the preview.

## The fidelity ladder

- **R30 — Design-system foundation.** A real system in the renderer:
  spacing scale, type scale, elevation/shadow, hairline borders, semantic
  surfaces (bg vs raised surface vs sunken), focus/hover affordances,
  refined radii — all derived from tokens. *(Phase 1)*
- **R31 — Realistic components.** Upgrade every block from schematic to
  production-looking, rendering real/derived content: app-bar header
  (brand + nav + avatar), nav tabs with an active state, cards (title/body/
  footer, accent detail, elevation), list rows (initialed avatar + title +
  subtitle + trailing meta/chevron), typed table cells (values inferred
  from the column name), hero (headline + subhead + CTA), fields (label +
  placeholder + helper), buttons (primary/secondary, elevation), status
  badges/pills. *(Phase 1)*
- **R32 — Expanded token model.** Grow `tokens` in the format: full palette,
  type scale, spacing unit, elevation level, density, light/dark — schema
  evolution with back-compat defaults. *(Phase 2)*
- **R33 — Component variants.** Contract-declared component variants/states
  render as real variants (Button primary/secondary/danger, Input
  default/error/disabled). *(Phase 2)*
- **R34 — Export parity.** SVG/PNG exporters render the R30/R31 system, so
  Figma/Penpot imports and shared exports match the preview fidelity.
  *(Phase 2)*
- **R35 — Icons & imagery.** A bundled, zero-dependency icon set and
  tasteful image treatment (still no external fetch). *(Phase 3)*
- **R36 — Density, type, and auto light/dark controls** in the preview.
  *(Phase 3)*

## Phase 1 (this work)

R30 + R31 in the HTML preview (`preview-template.ts`): the design-system CSS
and real-content components. Must preserve: `data-ux-screen`/`data-ux-state`
markers, the loading skeleton, empty/error/overlay treatments, comment-pin
anchoring (`data-bi`/`data-bt`/`data-bl`), and edit mode. Export renderers
follow in R34.

## Success test

Open the TaskPod preview: screens should read as a real product (typographic
hierarchy, elevated cards, realistic rows/tables, a proper app bar, themed
accent) — not a wireframe — while every state (loading/empty/error) still
renders honestly and every critic still passes.
