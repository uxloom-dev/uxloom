# RFC 0006 — Agent-addressable comments

Status: implemented (v0.9.0)

## Problem

The preview lets reviewers pin comments on mocks, and open comments surface
as `reviewer-comment` warnings in validation. But the loop from comment to
fix is manual: the reviewer writes a note, then separately explains to the
agent what and where it is. The comment already knows the screen, the state,
and the pixel it points at — the agent should be able to consume that
directly, and the reviewer should be able to hand a comment to the agent
with one click.

## Requirements

- **R21 — Anchor capture.** A comment records not just screen/state/x/y but
  the layout block the pin landed on (`block: { index, type, label? }`),
  when the screen has an explicit layout. Older comments without an anchor
  remain valid.
- **R22 — One-click hand-off.** Each open comment pin in the preview gets an
  "→ agent" action. Clicking sets the comment to `assigned` (persisted in
  the sidecar, broadcast to all viewers) and offers a copyable one-line
  prompt for the reviewer to paste into their agent. Assigned pins are
  visually distinct.
- **R23 — MCP work-packet tools.** Any MCP client (Claude, Codex, anything)
  can drive the loop without the preview server running:
  - `comments_list` — comments with effective status (`open` / `assigned` /
    `resolved`); default filter is unresolved, assigned first.
  - `comment_context` — the full work packet for one comment: the comment
    itself, the anchored block, the complete screen definition (contract,
    components, layout, rationale, exemptions), every journey state that
    references the screen with its transitions, and the current validation
    findings scoped to that screen.
  - `comment_resolve` — resolve with a mandatory resolution note
    (`resolvedBy: "agent"`, timestamped). The sidecar write wakes the
    preview watcher, so the pin clears live in every open browser.
- **R24 — Validation integration.** Assigned comments are called out
  distinctly in `project_validate` (summary gains `assignedComments`) and in
  `uxloom check` output, so an agent that only runs validation still
  discovers its assignments.
- **R25 — Surfaces.** Skill workflow rule (check `comments_list` at session
  start and after validation; never resolve without addressing), format.md,
  README, QUICKSTART, website, llms.txt, MCP README.

## Sidecar contract (`<project>.comments.json`)

This shape is shared by the preview server (writer/reader) and the MCP
tools (reader/writer). All new fields are optional — legacy comments parse.

```json
{
  "comments": [{
    "id": "uuid",
    "screen": "PaymentScreen",
    "state": "default",
    "x": 42.1, "y": 33.7,
    "text": "This button label is unclear",
    "resolved": false,
    "createdAt": "2026-08-08T10:00:00.000Z",
    "status": "assigned",
    "assignedAt": "2026-08-08T10:05:00.000Z",
    "block": { "index": 2, "type": "form", "label": "Card details" },
    "resolvedAt": "2026-08-08T10:20:00.000Z",
    "resolvedBy": "agent",
    "resolution": "Renamed the label to 'Pay securely' and added a helper line."
  }]
}
```

Rules every reader/writer follows:

- **Effective status**: `resolved === true` → `resolved`; else
  `status === "assigned"` → `assigned`; else `open`.
- **Invariant**: writers keep `resolved` (legacy boolean) and `status` in
  sync — `resolved` is true iff `status` is `"resolved"` (or status absent
  and resolved true).
- `resolvedBy` is `"agent"` when resolved via `comment_resolve`,
  `"reviewer"` when resolved in the preview UI.
- Resolving via MCP requires a non-trivial `resolution` note; resolving in
  the preview does not (the reviewer is the requester — they need no note).

## Non-goals

- No push channel from preview to agent process. The hand-off is
  pull-based: the click persists intent; the agent discovers it via
  `comments_list` / `project_validate` / `uxloom check`, or the reviewer
  pastes the copyable prompt. This keeps the tool model-agnostic and
  zero-dependency.
- No comment threads/replies. One comment, one resolution note. Threads are
  a future need with real user evidence, not now.
