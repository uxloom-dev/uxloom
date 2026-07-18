# RFC 0002 — `uxloom preview`: live wireframe mocks from the contract

**Status:** Shipping (v0.5.0)

## Problem

The contract is machine-perfect and human-opaque. Stakeholders can't review
JSON; users want to *see* every screen, every state, every flow, on every
viewport — and watch it appear in real time while the agent designs.

## First principles

Mocks are a *projection of the contract*, not a separate artifact. A canvas
tool (Figma) stores pictures of decisions; we store decisions — so rendering
is derivation, and the mock can never drift from the design. Consequences:

- **Every contracted state gets a mock for free**: `loading` renders as
  skeletons, `empty` as a placeholder, `error.*` as a banner over dimmed
  content, custom states (`key.issued-once`, `remove-confirm`) as overlays.
- **Journeys make the preview interactive**: outgoing events render as
  clickable actions that navigate to their target screen#state — the state
  machine IS the prototype.
- **Realtime is file-watching**: the agent edits via MCP tools; the browser
  updates over SSE. The human watches the design being woven, live.
- **Code-gen needs the contract, not the pixels**: any language target
  (React, React Native, SwiftUI, Compose) implements from the same
  semantic blocks + states + markers; the wireframe is for human eyes.

## Licensing decision

Zero runtime dependencies (Node built-ins + vanilla HTML/CSS/JS). Rejected:
Penpot (AGPL-3.0 — incompatible with MIT distribution), tldraw (proprietary
license since v2), Excalidraw (MIT but a React runtime for an aesthetic we
don't need). Playwright (Apache-2.0) remains the future choice for PNG
export — compatible, deferred until demanded.

## Design

- **CLI**: `uxloom preview [file]` → local server (default port 4400):
  `/` viewer page, `/project` fresh contract JSON, `/events` SSE on change.
- **Fidelity v1 is deliberate wireframe**: grayscale blocks, real labels,
  real states, real flows. High-fidelity theming (design tokens) is a later
  layer on the same renderer — structure first, paint later.
- **Optional `layout` on screens** (additive, backward compatible): ordered
  semantic blocks (`header, nav, hero, text, list, card, form, field,
  button, image, table, footer, custom`) with optional labels/counts/one
  level of children. Screens WITHOUT layout auto-derive blocks from their
  components — every existing project previews with zero changes.
- **Viewports**: desktop / tablet / mobile frames from the project's
  platforms; native platforms get mobile frames with platform chrome labels.

## Non-goals (v1)

Pixel-perfect theming, drag-editing on the canvas (the agent is the editor;
the file is the source), PNG/video export, multiplayer.
