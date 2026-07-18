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

**Deterministic by design**: same input, byte-identical report — benchmarked
([`packages/bench`](packages/bench)) at 1.000 precision/recall on a seeded
defect catalog, SHA-256-stable across processes, 1000 screens in under 5ms.
That's what lets design completeness gate CI, where an LLM opinion can't.

**Website:** [uxloom.dev](https://uxloom.dev) · **npm:** [`uxloom`](https://www.npmjs.com/package/uxloom) · **MCP registry:** `io.github.uxloom-dev/uxloom` · [![uxloom MCP server](https://glama.ai/mcp/servers/uxloom-dev/uxloom/badges/score.svg)](https://glama.ai/mcp/servers/uxloom-dev/uxloom)

![uxloom check finding 9 errors in a generated checkout flow, then passing the repaired one](docs/demo.gif)

## Packages

| Package | What it is |
|---|---|
| [`@uxloom/journeygraph`](packages/journeygraph) | The open design-as-data format: journeys as state machines, screens as nodes with required states |
| [`@uxloom/critics`](packages/critics) | The validators: journey completeness, state coverage, WCAG contrast, touch targets, text expansion |
| [`uxloom`](packages/mcp-server) | The MCP server + Agent Skills — the interface agents use |

**New here? Start with the [Quickstart](QUICKSTART.md)** — prerequisites,
the Claude Code walkthrough, what to say to your agent, and troubleshooting.

![Connecting UXLoom to Claude Code and running the first check](docs/getting-started.gif)

## Quick start (agents)

```bash
# Claude Code
claude mcp add uxloom -- npx -y uxloom

# Codex CLI
codex mcp add uxloom -- npx -y uxloom
```

The project file (`uxloom.project.json`) lives in your workspace and belongs
in git — the design is data, versioned next to the code it specifies.

## Quick start (humans & CI)

```bash
npx uxloom init      # one-command setup: MCP config + agent skill + starter file
npx uxloom preview   # live wireframe mocks: every screen, every state, clickable journeys
npx uxloom check     # design completeness — exit 1 on errors, CI-ready
npx uxloom audit     # implementation drift vs the contract — exit 1 on drift
```

![Live preview: state tabs and clickable journey events on wireframe mocks](docs/preview-demo.gif)

Add it to CI and a happy-path-only design can never merge:

```yaml
- run: npx uxloom check design/uxloom.project.json
```

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

Released and maintained: on [npm](https://www.npmjs.com/package/uxloom) and
the official MCP registry, with the benchmark scorecard published in every
[GitHub release](https://github.com/uxloom-dev/uxloom/releases). The
JourneyGraph format (`formatVersion: "0.1"`) may evolve until 1.0; releases
follow [RELEASING.md](RELEASING.md) — every surface is drift-checked in CI.

## License

MIT
