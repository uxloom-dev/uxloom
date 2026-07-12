# @uxloom/journeygraph

**JourneyGraph — an open design-as-data format.**

User journeys are state machines; screens are nodes with state contracts.
Plain JSON: diffable, git-friendly, agent-legible. This package provides the
TypeScript types, zod schemas, and helpers.

```ts
import { parseProject, type Project } from "@uxloom/journeygraph";

const project: Project = parseProject(JSON.parse(fileContents));
// journeys: state machines whose states reference screens
// screens:  requiredStates (contract) vs designedStates (progress),
//           components with colors, labels, target sizes
// exemptions: documented reasons a baseline state doesn't apply
```

Part of [UXLoom](https://uxloom.dev) — agent-native UI/UX design validation.
Validators live in [`@uxloom/critics`](https://www.npmjs.com/package/@uxloom/critics);
the MCP server is [`uxloom`](https://www.npmjs.com/package/uxloom).

Format version: `0.1` — may change without notice until 1.0. MIT licensed.
