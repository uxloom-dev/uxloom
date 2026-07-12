# UXLoom

**Your generator gave you 6 screens. UXLoom proves you're missing 9 states.**

AI generators (v0, Lovable, Figma Make, Claude) produce happy-path screens.
UXLoom is the critic layer: it models user journeys as state machines, treats
screens as nodes with state contracts, and mechanically proves what's missing
before a line of production code exists — unreachable screens, dead ends,
missing error/empty/loading states, WCAG contrast failures, undersized touch
targets, and labels that will overflow under localization.

Agent-native by design: the interface is an MCP server (works with Claude
Code, Codex, and any MCP client), with Agent Skills included.

**Website:** [uxloom.dev](https://uxloom.dev) · **npm:** [`uxloom`](https://www.npmjs.com/package/uxloom)

## Packages

| Package | What it is |
|---|---|
| [`@uxloom/journeygraph`](packages/journeygraph) | The open design-as-data format: journeys as state machines, screens as nodes with required states |
| [`@uxloom/critics`](packages/critics) | The validators: journey completeness, state coverage, WCAG contrast, touch targets, text expansion |
| [`uxloom`](packages/mcp-server) | The MCP server + Agent Skills — the interface agents use |

## Quick start (agents)

```bash
# Claude Code
claude mcp add uxloom -- npx -y uxloom

# Codex CLI
codex mcp add uxloom -- npx -y uxloom
```

The project file (`uxloom.project.json`) lives in your workspace and belongs
in git — the design is data, versioned next to the code it specifies.

Workflow (also shipped as a skill in `packages/mcp-server/skills/`):
`project_init` → `brief_start`/`brief_answer` → `journey_define` →
`screen_register` → `project_validate` → fix → repeat until zero errors →
`coverage_report`.

## Does it actually catch things?

`tools/dogfood.mjs` drives the real MCP server through three products, twice
each: screens as a happy-path generator hands them over, then repaired using
the validation report. Artifacts in [`examples/`](examples/).

| Product | Generated (happy-path) | Repaired |
|---|---|---|
| `shopmweb` — e-commerce checkout (mWeb + Android) | 9 errors, 6 warnings | 0 / 0 |
| `taskflow` — SaaS signup/onboarding (web) | 1 error, 6 warnings | 0 / 0 |
| `ridenow` — ride booking (iOS + Android, offline-heavy) | 3 errors, 7 warnings | 0 / 0 |

Caught: an unreachable promo screen, dead-end verification states, five
undesigned payment/error states, a 2.4:1 contrast button, a 40px touch target
on Android, a checkout label that breaks in German, and three products' worth
of missing offline states. Zero errors *and zero warnings* is reachable
honestly — screens declare documented `exemptions` where a baseline state
genuinely cannot apply, and contradictory exemptions are flagged.

## Development

```bash
npm install
npm run typecheck
npm test
```

## Status

Pre-release, under active development. The format (`formatVersion: "0.1"`)
will change without notice until 1.0.

## License

MIT
