# uxloom

**Agent-native UI/UX design validation via MCP.**

Your generator gave you 6 screens. UXLoom proves you're missing 9 states —
unreachable screens, dead ends, missing error/empty/loading states, WCAG
contrast failures, undersized touch targets, and labels that break under
localization. All before a line of production code exists.

## Install

```bash
# Claude Code
claude mcp add uxloom -- npx -y uxloom

# Codex CLI
codex mcp add uxloom -- npx -y uxloom
```

The design lives in `uxloom.project.json` in your workspace — plain JSON,
diffable, versioned in git next to the code it specifies. Override the path
with the `UXLOOM_PROJECT` environment variable.

## CLI

```bash
npx uxloom init           # set up any project: MCP config + skill + starter file
npx uxloom check [file]   # design completeness; exit 1 on errors
npx uxloom audit [file]   # implementation drift vs the contract; exit 1 on drift
npx uxloom preview [file] # live mocks — themed by design tokens, every state,
                          # clickable journeys, reviewer comment mode
npx uxloom export [file]  # shareable HTML [--out] · --svg dir (Figma/Penpot)
                          #   · --png dir (optional playwright)
npx uxloom diff <a> <b>   # semantic design diff (also --git <ref>, --markdown)
```

The audit reads native markers too — `// data-ux-state:` comments in any
language, SwiftUI `accessibilityIdentifier("ux-state:…")`, Compose
`testTag("ux-state:…")` — and `--live <url>` verifies markers in the real
DOM when optional playwright is installed.

`check`/`audit` flags: `--json`, `--sarif` (code scanning), `--github`
(inline PR annotations), `--update-baseline` (freeze existing findings —
brownfield adoption). Thresholds configurable via `uxloom.config.json`.

Colored findings with concrete fixes. `check` gates design completeness;
`audit` gates implementation fidelity via `data-ux-state` markers and an
optional `uxloom.map.json` screen registry — both CI-ready.

## Tools

| Tool | Purpose |
|---|---|
| `project_init` | Create the project file (name + platforms) |
| `brief_start` / `brief_answer` | Structured design brief: the agent answers from context, only taste questions escalate to the human, assumptions are logged |
| `journey_define` | Add a journey — a state machine whose states reference screens |
| `screen_register` | Add a screen: intent, required states (contract), designed states (progress), components |
| `project_import` / `project_export` | Whole-design registration / retrieval in one call |
| `palette_check` | WCAG AA check of design-token color pairs, with thin-margin flags |
| `project_audit` | Implementation drift: per-state verdicts (implemented / unimplemented / unproven) with file:line evidence |
| `design_review` | Iterative evidence-based review — max 3 rounds (enforced, persisted), six-part rubric incl. market fit; pairs with per-decision `rationale` in the format |
| `comments_list` | Reviewer comments with lifecycle status — comments assigned via the preview's "→ agent" click are the agent's work queue |
| `comment_context` | Full work packet for one comment: the pinned layout block, screen contract, journey refs, and screen-scoped findings |
| `comment_resolve` | Resolve after addressing, with a resolution note the reviewer reads; the pin clears live in every open preview |
| `project_validate` | Run every critic; iterate until zero errors |
| `screen_critique` | Findings scoped to one screen |
| `coverage_report` | Screens delivered vs. states the journeys need |

## Skills

An Agent Skill encoding the journey-first workflow ships in `skills/uxloom/`
— copy it to `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).

Docs and source: [github.com/uxloom-dev/uxloom](https://github.com/uxloom-dev/uxloom) · [uxloom.dev](https://uxloom.dev)

MIT licensed.
