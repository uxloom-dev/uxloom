# Implementation audit — drift detection between contract and code

## Contents
- What the audit proves
- The marker convention (how to make code self-auditing)
- The registry (uxloom.map.json)
- Verdicts and finding codes
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

## Workflow for agents

1. When **implementing** from a contract: emit markers as you build each
   state — the code becomes self-auditing for free.
2. When **auditing** an existing codebase: run uxloom:project_audit; for
   unproven screens, read the code, add markers where states genuinely
   render, re-run. States you cannot mark truthfully are your gap list.
3. In CI: `npx uxloom check && npx uxloom audit` — design completeness
   and implementation fidelity, both gated on exit codes.
