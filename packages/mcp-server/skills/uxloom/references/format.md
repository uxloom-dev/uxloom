# JourneyGraph format reference (v0.1)

## Contents
- Modeling conventions (screens vs states)
- Project shape
- Journeys and target refs
- Screens, contracts, and components
- Exemptions
- Validation rules the schema enforces

## Modeling conventions (screens vs states)

Consistent granularity keeps designs comparable and critics meaningful:

- **A screen is a destination** — a page, route, or full view a user lands on.
- **A state is a condition of that destination** — modals, drawers, tabs,
  panels, confirmation dialogs, and transient conditions are screen states,
  not separate screens. Examples: `create` (a creation modal on a list
  screen), `key.issued-once` (a shown-once panel), `remove-confirm` (a
  typed-confirmation dialog), `identity.pending` (an auto-refreshing tab
  condition).
- **Dot-namespace variants**: `error.network`, `error.validation`,
  `create.error.slug-taken` — the family prefix is what exemptions like
  `error.any` match on.
- **Journeys end.** Every journey needs at least one `final` state — for
  browse/manage journeys, the state where the user's goal is satisfied is
  final even if it has outgoing events.

## Project shape

```json
{
  "name": "shopfast",
  "formatVersion": "0.1",
  "platforms": ["web", "mweb", "ios", "android"],
  "journeys": [ ... ],
  "screens": [ ... ]
}
```

Stored at `uxloom.project.json` (override with `UXLOOM_PROJECT` env var).
Plain JSON, versioned in git next to the code it specifies.

## Journeys and target refs

A journey is a state machine. States reference screens; events move between
states.

```json
{
  "id": "checkout",
  "goal": "Returning shopper completes purchase in under 90 seconds",
  "entry": "cart",
  "states": {
    "cart":    { "screen": "CartScreen",
                 "on": { "CHECKOUT": "payment", "CART_EMPTY": "cart#empty" } },
    "payment": { "screen": "PaymentScreen",
                 "on": { "PAY": "confirm",
                         "CARD_DECLINED": "payment#error.declined",
                         "BACK": "cart" } },
    "confirm": { "screen": "ConfirmScreen", "final": true }
  }
}
```

**Target refs**: `"payment"` targets a journey state; `"payment#error.declined"`
targets that state landing on a specific screen state. The screen state after
`#` must be in the target screen's requiredStates or validation fails.

**State ids**: `[a-zA-Z][\w-]*` with optional dot-separated substates
(`error.network`, `error.declined`).

## Screens, contracts, and components

```json
{
  "id": "PaymentScreen",
  "intent": "Collect payment with minimum anxiety",
  "requiredStates": ["default", "loading", "error.declined", "error.network"],
  "designedStates": ["default", "loading"],
  "platforms": ["mweb", "android"],
  "components": [
    {
      "semantic": "Button.Primary",
      "interactive": true,
      "minTargetPx": 48,
      "label": { "key": "checkout.pay", "en": "Pay now", "maxChars": 16 },
      "fg": "#FFFFFF",
      "bg": "#1D4ED8"
    }
  ],
  "exemptions": [
    { "state": "empty", "reason": "Payment form has no data-list to be empty." }
  ]
}
```

- `requiredStates` is the contract (what production needs); `designedStates`
  is progress (what exists so far). Validation errors on every gap.
- `platforms` defaults to the project's platforms when omitted.
- `semantic` names a role (`Button.Primary`, `List.Selectable`, `Nav.Tabs`) —
  never pixels or specific markup.
- Give `fg`/`bg` to every text-bearing component, `minTargetPx` to every
  interactive one, and `maxChars` to every space-constrained label — the
  critics can only check what is declared.

## Exemptions

An exemption documents why a baseline state (empty / loading / error.*) does
not apply to a screen. The reason must be a real sentence (min 15 chars,
schema-enforced). `"error.any"` (any `error`-prefixed state) exempts the
error family. An exemption for a state that is also in requiredStates is
flagged as contradictory.

## Rich transitions, tokens, content, and team-scale features (v0.6)

**Guards and roles** — transitions accept an object form when a condition
or role matters:

```json
"on": {
  "DELETE": { "target": "confirm", "guard": "user.canDelete", "roles": ["admin"] },
  "BACK": "list"
}
```

**Platform-scoped journeys** — divergent mobile/desktop flows are separate
journeys with `"platforms": ["mweb"]` on the journey.

**Design tokens** — project-level `tokens` theme the preview and document
the system: `{ "colors": { "accent": "#2F6B52", "bg": "#FAF9F6", "surface":
"#FFFFFF", "text": "#2B2725", "muted": "#7A716B" }, "radius": 8, "font":
"Iowan Old Style, serif" }`. Verify pairs with uxloom:palette_check.
Optional (v0.12, all default-derived so existing projects need no change):
`colors.border` overrides the hairline; `colors.success` / `warning` /
`danger` color status pills semantically (a "Done" badge goes green, a
"Blocked" badge red) in both the preview and the SVG export; `mode:
"light" | "dark"` tunes elevation and tint — auto-detected from `bg`
luminance when omitted. The high-fidelity renderer (v0.11) turns these
tokens into production-looking UI, not wireframes.

**Content-rich blocks** — table blocks take `columns: ["Recipient",
"Status", "Sent"]`; text/hero blocks take `copy` (real copy, not lorem);
any block takes `source` naming its data binding. Screens take `data`
(`{ "messages": "Message[]", "filter": "StatusFilter" }`) so implementers
know the shape.

**Component variants (v0.13)** — buttons take `variant: "primary" |
"secondary" | "danger" | "ghost"` (primary by default; ghost is inferred
from labels like "Cancel"/"Learn more" when unset), and fields/buttons take
`state: "default" | "error" | "disabled"` — an `error` field renders a red
outline + helper line. Both the preview and the SVG export render them.

**Fragments (team scale)** — the base file may declare
`"include": ["designs/*.json"]`; fragment files are `{ "journeys": [...],
"screens": [...] }` merged at load. Duplicate ids across files are errors.
MCP tools write to the base file; fragments are edited as files.

**Design rationale (evidence-based design, v0.8)** — project, journeys,
and screens carry the evidence behind decisions:

```json
"rationale": {
  "decision": "Single-column checkout",
  "reasoning": "Completion task; category convention is a distraction-free linear flow…",
  "alternatives": [{ "option": "Two-column", "pros": ["cart visible"], "cons": ["collapses on mobile"] }],
  "sources": ["https://baymard.com/…"],
  "confidence": "high"
}
```

Adoption-gated enforcement: once any rationale exists (or config sets
`"rationale": "required"`), undocumented decisions become
`rationale-missing` warnings and weak ones `rationale-thin` (short
reasoning, or no alternative with real pros AND cons). Process:
[design-intelligence.md](design-intelligence.md); iterate with
uxloom:design_review (max 3 rounds, enforced).

**Config and baseline** — `uxloom.config.json` overrides thresholds
(`{ "thresholds": { "contrastRatio": 7, "expansionFactor": 1.5,
"touchTargets": { "web": 44 } } }`). `uxloom check --update-baseline`
freezes existing findings into `uxloom.baseline.json` (brownfield
adoption: block only new drift). Never baseline findings you can fix now.

**Reviewer comments (agent-addressable, v0.9)** — designers drop pinned
comments in the preview; each pin records its screen, state, and the layout
block it lands on. Open comments appear in validation as `reviewer-comment`
warnings; comments the reviewer clicked "→ agent" on are *assigned* and
appear first. The loop: uxloom:comments_list → uxloom:comment_context (full
work packet: comment, anchored block, screen contract, journey refs,
screen findings) → make the change → uxloom:comment_resolve with a real
resolution note. Resolutions persist to `<project>.comments.json` and the
pin clears live in every open preview. Never resolve without addressing.

## Validation rules the schema enforces

- Unknown fields are rejected (strict schemas) — a typo fails loudly instead
  of silently dropping data.
- Colors are hex (`#RGB` or `#RRGGBB`); platforms are one of
  `web | mweb | ios | android`; requiredStates is non-empty.
