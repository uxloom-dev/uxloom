# JourneyGraph format reference (v0.1)

## Contents
- Project shape
- Journeys and target refs
- Screens, contracts, and components
- Exemptions
- Validation rules the schema enforces

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

## Validation rules the schema enforces

- Unknown fields are rejected (strict schemas) — a typo fails loudly instead
  of silently dropping data.
- Colors are hex (`#RGB` or `#RRGGBB`); platforms are one of
  `web | mweb | ios | android`; requiredStates is non-empty.
