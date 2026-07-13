# Worked example — generator output to zero findings

## Contents
- The generated (broken) checkout
- What validation reports
- The repaired version and why each change was made

## The generated (broken) checkout

A happy-path generator produced 5 screens and this journey:

```json
{
  "id": "checkout",
  "entry": "cart",
  "states": {
    "cart":    { "screen": "CartScreen",    "on": { "CHECKOUT": "address" } },
    "address": { "screen": "AddressScreen", "on": { "CONTINUE": "payment" } },
    "payment": { "screen": "PaymentScreen", "on": { "PAY": "confirm" } },
    "confirm": { "screen": "ConfirmScreen", "final": true },
    "promo":   { "screen": "PromoScreen",   "on": { "APPLY": "cart" } }
  }
}
```

Screens declared `requiredStates` like `["default"]` or came with states
undesigned, one button was `#8A8F98` on `#F4F4F4` at 40px with the label
"Proceed to secure checkout" (maxChars 24).

## What validation reports

9 errors, 6 warnings — the demo numbers:

- `unreachable` — promo exists but no event leads to it
- `state-undesigned` ×5 — cart empty/loading; payment loading/error.declined/error.network
- `contrast-below-aa` — 2.95:1 against the 4.5:1 minimum
- `target-too-small` ×2 — 40px vs mweb 44 / android 48
- `label-overflow` — 26 chars × 1.4 = 37 > budget 24
- `happy-path-contract` warnings on every weak contract

## The repaired version and why each change was made

1. **Wire the unreachable state**: `"APPLY_PROMO": "promo"` from cart, and
   give promo a `CANCEL` back-path — reachable and no dead end.
2. **Add failure transitions**: `"CARD_DECLINED": "payment#error.declined"`,
   `"OFFLINE": "payment#error.network"`, plus `BACK` events — the `#` refs
   force those states into the payment screen's contract.
3. **Design the missing states** and list them in `designedStates`.
4. **Fix the button**: `#FFFFFF` on `#B3541E` (≥4.5:1), `minTargetPx: 48`
   (covers android), label shortened to "Checkout".
5. **Exempt honestly** instead of padding contracts:

```json
"exemptions": [
  { "state": "empty",     "reason": "Terminal confirmation; reached only with a placed order." },
  { "state": "error.any", "reason": "Failures surface on PaymentScreen before this state is reachable." }
]
```

Result: 0 errors, 0 warnings, coverage 16/16 — reached by fixing real gaps
and documenting real non-applicability, not by weakening the contract.

Full before/after project files: `examples/shopmweb/` in the repository
(`uxloom.generated.project.json` vs `uxloom.project.json`).
