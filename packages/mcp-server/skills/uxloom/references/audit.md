# Implementation audit — drift detection between contract and code

## Contents
- What the audit proves
- The marker convention (how to make code self-auditing)
- Native platforms (Swift / Kotlin / Dart / Java)
- The registry (uxloom.map.json)
- Verdicts and finding codes
- Marker quality (anti-washing)
- Workflow for agents

## What the audit proves

`uxloom:project_audit` (or `npx uxloom audit`) checks whether the
implementation actually contains each contracted screen state. Static
analysis is honest about its limits: a state earns **implemented** only
with marker evidence (file:line); files without markers yield **unproven**,
never a false pass.

## The marker convention

When implementing a screen from the contract, mark where each state
renders — any framework, zero runtime cost:

```tsx
<main data-ux-screen="MessageDetail">
  {isLoading && <Skeleton data-ux-state="loading" />}
  {error && <ErrorPanel data-ux-state="error.network" onRetry={retry} />}
  {message?.status === "parked" && <ParkedNotice data-ux-state="parked" />}
  {message && <Timeline data-ux-state="default" events={message.events} />}
</main>
```

- `data-ux-screen="<ScreenId>"` once per screen component — it also maps
  the file without needing a registry entry.
- `data-ux-state="<state>"` on the element that renders each contracted
  state, exactly matching the contract's state ids.

## Native platforms (Swift / Kotlin / Dart / Java)

The audit scans `.swift`, `.kt`, `.kts`, `.dart`, and `.java` sources too.
Since native UI has no HTML attributes, three marker forms are recognized —
all equal-weight tier-2 evidence, same verdicts, same file:line:

**1. Attribute form** (web, shown above): `data-ux-screen="X"` /
`data-ux-state="y"`.

**2. Native identifiers** — piggyback on the accessibility/test hooks you
should be setting anyway:

SwiftUI:

```swift
VStack {
  Text("Inbox").accessibilityIdentifier("ux-screen:Inbox")
  if isLoading {
    ProgressView().accessibilityIdentifier("ux-state:loading")
  }
  List(rows) { RowView($0) }.accessibilityIdentifier("ux-state:default")
}
```

Jetpack Compose:

```kotlin
// data-ux-screen: Inbox
@Composable
fun InboxScreen(state: UiState) {
  when (state) {
    UiState.Loading -> Spinner(Modifier.testTag("ux-state:loading"))
    UiState.Empty -> EmptyCard(Modifier.testTag("ux-state:empty"))
    else -> MessageList(Modifier.testTag("ux-state:default"))
  }
}
```

**3. Comment form** — works in any language (Dart, Java, or anywhere an
identifier can't be attached). `//` and single-line `/* ... */` are both
recognized; whitespace around the `:` is tolerated:

```dart
// data-ux-screen: Profile
Widget build(BuildContext context) {
  if (loading) {
    return Spinner(); // data-ux-state: loading
  }
  return ProfileBody(); // data-ux-state: default
}
```

Comment markers are **declaration-grade evidence**: they assert where a
state renders but, unlike an attribute on an element, they cannot prove
anything about the element itself — so the thin-marker check does not
apply to them (nor to identifier markers). Live verification (the DOM
tier) is the stronger tier when you need proof beyond declaration. The
static-render check still applies to all forms: an unconditional
`loading`/`empty`/`error*` marker is challenged whatever its spelling.

## The registry (uxloom.map.json)

For files that can't carry a screen marker (or to scope shared files),
map screens to path globs next to the project file:

```json
{
  "MessageDetail": { "paths": ["app/dashboard/messages/[id]/**", "components/messages/*"] }
}
```

Globs support `**` and `*`. A screen with neither markers nor matching
registry paths is an error — it has no implementation at all.

## Verdicts and finding codes

| Code | Severity | Meaning |
|---|---|---|
| `screen-unmapped` | error | no files at all for a contracted screen |
| `state-unimplemented` | error | screen uses markers, this state has none |
| `state-unproven` | warning | files exist but carry no markers — nothing verifiable |

## Marker quality (anti-washing)

A marker on an empty element proves nothing — "marker washing" is pasting
`data-ux-state` attributes to turn verdicts green without implementing the
states. Tier 2.5 runs static marker-quality heuristics that challenge
suspicious markers. **Heuristics challenge evidence, they never grant it**:
every check emits a warning with file:line evidence and never upgrades a
verdict. They are conservative — when the source is ambiguous they stay
silent.

| Code | Severity | Triggered when |
|---|---|---|
| `state-marker-thin` | warning | the marker sits on a bare element that renders nothing: self-closing (`<div data-ux-state="empty" />`) or closing immediately with only whitespace inside, with no other props (no className, no children, no bindings). Attribute form only — comment and identifier markers cannot prove element emptiness, so they are never flagged thin |
| `state-marker-duplicate` | warning | one element carries several `data-ux-state` attributes, or two different states are marked on textually identical bare elements in the same file — one element cannot render two distinct states distinctly; each state is flagged once. Attribute form only, for the same reason as thin |
| `state-marker-static` | warning | a conditional-by-nature state (`loading`, `empty`, or any `error*`) has no conditional-rendering signal (`&&`, ternary/`?:`, `if`, `guard`, `switch`, `when`, `.let`, `v-if`, `*ngIf`, `{#if`, `.map(`, optional chaining) on its line or the 3 lines above — the state is likely always- or never-rendered. Applies to all three marker forms. Not applied to `default` or custom states, and suppressed inside components named after the state (e.g. `function LoadingSkeleton`, `struct LoadingView`, `fun EmptyState`, `class ErrorBanner`), where the conditional lives at the call site |

Fixing the warnings is always the same move: render the real state UI
inside (or as) the marked element, gated by the condition that actually
produces the state — never relocate the marker to silence the check.
Static heuristics narrow washing; they cannot eliminate it — fixture and
browser tiers (4–5) remain future work.

## Design audit — drift between the contract and the design file

The same drift check runs in the other direction, against a Figma/Penpot
export instead of code. `uxloom:design_audit` (or `npx uxloom audit
--design <file|dir>`) reads a designer's exported SVG or JSON — or a
`uxloom export --svg --manifest` folder — recovers each frame's screen×state
from its name (grammar `Screen / state`, or the manifest), and reports:

- `design-screen-unmapped` (error) — a contracted screen has no frame
- `design-state-missing` (error) — a required state has no frame
- `design-frame-unmapped` (warning) — a frame matches no contracted screen

Pass `scaffold` / `--scaffold <out>` to write a draft `{ screens }` fragment
for the unmapped frames (it never overwrites). Zero API coupling — it reads
files the designer already exports. Frames named by `uxloom export --svg`
round-trip losslessly, so a design that started from the contract re-audits
clean until someone drops a required state.

## Workflow for agents

1. When **implementing** from a contract: emit markers as you build each
   state — the code becomes self-auditing for free.
2. When **auditing** an existing codebase: run uxloom:project_audit; for
   unproven screens, read the code, add markers where states genuinely
   render, re-run. States you cannot mark truthfully are your gap list.
3. When **auditing a design**: run uxloom:design_audit against the designer's
   export; missing screens/states are the design's gap list — feed them back
   into the contract or the mocks.
4. In CI: `npx uxloom check && npx uxloom audit` — design completeness
   and implementation fidelity, both gated on exit codes.
