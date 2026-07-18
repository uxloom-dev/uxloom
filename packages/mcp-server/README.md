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
npx uxloom preview [file] # live wireframe mocks in the browser — every screen,
                          # every state, every viewport, clickable journeys
```

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
| `project_validate` | Run every critic; iterate until zero errors |
| `screen_critique` | Findings scoped to one screen |
| `coverage_report` | Screens delivered vs. states the journeys need |

## Skills

An Agent Skill encoding the journey-first workflow ships in `skills/uxloom/`
— copy it to `.claude/skills/` (Claude Code) or `.agents/skills/` (Codex).

Docs and source: [github.com/uxloom-dev/uxloom](https://github.com/uxloom-dev/uxloom) · [uxloom.dev](https://uxloom.dev)

MIT licensed.
