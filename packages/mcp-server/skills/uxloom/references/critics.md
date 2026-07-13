# Critics reference — finding codes, thresholds, and how to fix each

## Contents
- journey-completeness (6 error codes)
- state-coverage (2 errors, 2 warnings, exemption policy)
- wcag-contrast
- touch-targets
- text-expansion
- Severity policy

## journey-completeness

Structural proofs over every journey. All findings are errors.

| Code | Meaning | Fix |
|---|---|---|
| `entry-missing` | entry names an undefined state | add the state or change entry |
| `screen-missing` | state references an unregistered screen | register the screen |
| `target-missing` | event targets an undefined state | add the state or retarget |
| `target-state-missing` | `state#screenState` ref where screenState is not in the target screen's requiredStates | add it to requiredStates |
| `dead-end` | non-final state with no outgoing events | mark final or add events (incl. BACK/CANCEL) |
| `unreachable` | state no user can ever arrive at (BFS from entry) | add a transition to it or remove it |
| `no-final-state` | journey can never complete | mark at least one state final |

## state-coverage

The anti-happy-path critic.

| Code | Severity | Meaning |
|---|---|---|
| `state-undesigned` | error | requiredState with no design yet |
| `contract-drift` | warning | designed state missing from the contract |
| `happy-path-contract` | warning | contract lacks empty/loading/error.* without exemption |
| `contradictory-exemption` | warning | state both exempted and required |

**Exemption policy**: suppressing `happy-path-contract` requires a written
reason per state (or `error.any` for the error family). Legitimate examples:
terminal confirmation screens (no empty state), blank-by-definition forms
(no empty state), static instruction screens (no loading). Illegitimate:
"not needed", "later", any reason under 15 characters (schema rejects).

## wcag-contrast

`contrast-below-aa` (error): components declaring both `fg` and `bg` are
checked against WCAG 2.2 AA for normal text — **4.5:1** minimum, computed via
relative luminance. Fix by darkening/lightening either side. Large-text
(3:1) allowance is not yet modeled; when a component is genuinely large
display text, note it and pick colors meeting 4.5:1 anyway.

## touch-targets

`target-too-small` (error): interactive components with `minTargetPx` are
checked per platform the screen ships on:

| Platform | Minimum | Source |
|---|---|---|
| ios | 44 | iOS HIG 44pt |
| android | 48 | Material 48dp |
| mweb | 44 | recommended touch web |
| web | 24 | WCAG 2.2 target-size AA |

The target includes padding/hit-slop, not just the visible glyph.

## text-expansion

`label-overflow` (warning): labels with `maxChars` are checked at ×1.4 —
the standard pseudo-localization planning factor (German/Finnish run 30–40%
longer than English for UI-length strings). Fix by shortening the English
source or widening the layout budget.

## Severity policy

- **error** = provably broken for users; blocks (CLI exits 1; validation loop
  must not stop while any remain).
- **warning** = judgment call surfaced; resolve it or exempt it with a
  reason — never ignore it silently.
