# @uxloom/critics

**Design critics for JourneyGraph projects.**

Five validators that prove what a UI design is missing — before code exists:

- **journey-completeness** — unreachable screens, dead ends, broken
  transitions, journeys that can never finish
- **state-coverage** — required vs designed states (empty / loading /
  error.*), happy-path-only contracts, documented exemptions
- **wcag-contrast** — WCAG 2.2 AA (4.5:1) from declared colors
- **touch-targets** — 44pt iOS HIG, 48dp Android Material, 24px WCAG web
- **text-expansion** — labels that overflow at the ×1.4 localization factor

```ts
import { critique } from "@uxloom/critics";
import { parseProject } from "@uxloom/journeygraph";

const report = critique(parseProject(projectJson));
// report.findings: [{ critic, code, severity, screen, message, fix }, ...]
// report.summary:  { errors, warnings, stateCoverage: { designed, required } }
```

Part of [UXLoom](https://uxloom.dev). The MCP server that exposes these to
AI agents is [`uxloom`](https://www.npmjs.com/package/uxloom). MIT licensed.
