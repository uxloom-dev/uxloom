# Releasing — the surface-sync contract

Every capability change must reach every applicable surface. Nobody
remembers this manually; the machine enforces it. This document is the
map of surfaces and the process that keeps them coherent.

## The principle

Same philosophy as the product: **single source of truth, deterministic
checks, CI gates.** The source of truth for the tool list is the running
MCP server (introspected, not grepped); for the version it is
`packages/mcp-server/package.json`. Everything else is either *derived*
(never hand-edited) or *enforced* (CI fails with the exact fix).

## Surfaces

| Surface | Sync mechanism |
|---|---|
| serverInfo version (`server.ts`) | **Derived** — read from package.json at runtime |
| npm packages | **Automated** — release pipeline publishes unpublished versions with provenance |
| MCP registry (`server.json`) | **Enforced** — consistency check requires version match; release-prep bumps it |
| GitHub release + benchmark scorecard | **Automated** — release pipeline |
| Website version badge, copy | **Enforced** — badge must match major.minor; stale claims ("pre-release", "coming soon") are banned; release-prep stamps the badge |
| `docs/llms.txt` tool list | **Enforced** — must list every real tool |
| READMEs (root + packages) | **Enforced** — tool table complete; CLI commands must exist; no rotting tool counts |
| Agent skill (`skills/uxloom/`) | **Enforced** — may never reference a nonexistent tool; ships inside the npm package so it versions atomically |
| Benchmark claims | **Enforced** — bench runs on every push against a committed baseline; scorecard regenerated per release |
| Glama listing | **External, self-syncing** — unpinned commit means their builds track main; after a significant release, optionally press Build & Release in the Glama admin to refresh their release object |
| awesome-mcp-servers entry | **External, manual** — keep the entry **evergreen** (no version numbers, no tool counts); it should only need touching if positioning changes |

## The release flow (three commands)

```bash
node tools/release-prep.mjs 0.4.0   # bumps every surface, runs build+tests+consistency+bench
git add -A && git commit -m "Release v0.4.0: <what changed>" && git push
git tag v0.4.0 && git push origin v0.4.0   # pipeline: npm + registry + release w/ scorecard
```

## The standing gates (every push, not just releases)

CI runs typecheck → tests → **surface consistency** → **benchmark vs
baseline**. A PR that adds a tool without documenting it, documents a CLI
command that doesn't exist, leaves a stale claim, or degrades a benchmark
grade **cannot merge**. The failure message names the surface and the fix.

## Writing rules that prevent drift at the source

- **Never hardcode**: versions, tool counts, or dates in prose. Say
  "the tools" not "the 12 tools" — numbers rot, the checker bans them.
- **New tool checklist** (enforced, listed here for humans): register in
  `server.ts` → row in `packages/mcp-server/README.md` → name in
  `docs/llms.txt` → skill reference if agents should use it → test.
- **New CLI command**: implement in `cli.ts` usage → QUICKSTART → README.
- **Copy states facts, not futures**: "lands soon" phrasing is banned by
  the checker because futures become lies silently.
