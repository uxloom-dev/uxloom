# Implementation audit — drift detection between contract and code

## Contents
- What the audit proves
- The marker convention (how to make code self-auditing)
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
| `state-marker-thin` | warning | the marker sits on a bare element that renders nothing: self-closing (`<div data-ux-state="empty" />`) or closing immediately with only whitespace inside, with no other props (no className, no children, no bindings) |
| `state-marker-duplicate` | warning | one element carries several `data-ux-state` attributes, or two different states are marked on textually identical bare elements in the same file — one element cannot render two distinct states distinctly; each state is flagged once |
| `state-marker-static` | warning | a conditional-by-nature state (`loading`, `empty`, or any `error*`) has no conditional-rendering signal (`&&`, ternary, `if`, `switch`, `v-if`, `*ngIf`, `{#if`, `.map(`, optional chaining) on its line or the 3 lines above — the state is likely always- or never-rendered. Not applied to `default` or custom states, and suppressed inside components named after the state (e.g. `function LoadingSkeleton`), where the conditional lives at the call site |

Fixing the warnings is always the same move: render the real state UI
inside (or as) the marked element, gated by the condition that actually
produces the state — never relocate the marker to silence the check.
Static heuristics narrow washing; they cannot eliminate it — fixture and
browser tiers (4–5) remain future work.

## Workflow for agents

1. When **implementing** from a contract: emit markers as you build each
   state — the code becomes self-auditing for free.
2. When **auditing** an existing codebase: run uxloom:project_audit; for
   unproven screens, read the code, add markers where states genuinely
   render, re-run. States you cannot mark truthfully are your gap list.
3. In CI: `npx uxloom check && npx uxloom audit` — design completeness
   and implementation fidelity, both gated on exit codes.
