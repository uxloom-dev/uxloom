import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  JourneySchema,
  ScreenSchema,
  PlatformIdSchema,
  ProjectSchema,
  type Journey,
  type Project,
  type Screen,
} from "@uxloom/journeygraph";
import { critique, critiqueScreen, contrastRatio } from "@uxloom/critics";
import { dirname, resolve } from "node:path";
import { ProjectStore } from "./store.js";
import { briefQuestions, compileBrief } from "./brief.js";
import { loadMap, runAudit } from "./audit.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function createServer(store = new ProjectStore()): McpServer {
  const server = new McpServer({ name: "uxloom", version: "0.3.0" });

  server.tool(
    "project_init",
    "Create a new UXLoom project file (uxloom.project.json). Run once per product.",
    {
      name: z.string().describe("Product name"),
      platforms: z.array(PlatformIdSchema).min(1).describe("Target platforms"),
    },
    async ({ name, platforms }) => {
      const project = store.init(name, platforms);
      return json({ ok: true, path: store.path, project });
    },
  );

  server.tool(
    "brief_start",
    "Start a design brief. Returns a structured questionnaire. Answer every question you can yourself — from the provided context document (PRD, spec) first, then conversation context; only relay questions marked askHuman:true to the user. Then call brief_answer.",
    {
      prompt: z.string().describe("The product/design request, verbatim"),
      context: z
        .string()
        .optional()
        .describe("Existing product context if any: PRD, spec, or design doc contents. When provided, extract answers from it instead of asking."),
    },
    async ({ prompt, context }) => {
      return json({
        resultType: "inputRequired",
        instructions: context
          ? "A context document was provided. Extract every answer you can from it — including askHuman questions like brand, if the document states them. Only relay to the user what the document and conversation genuinely do not answer. Unanswered questions fall back to their default and are logged in the assumption ledger."
          : "Fill answers from conversation context. Only askHuman:true questions go to the user. Unanswered questions fall back to their default and are logged in the assumption ledger.",
        inputRequests: briefQuestions(prompt),
      });
    },
  );

  server.tool(
    "brief_answer",
    "Submit brief answers. Unanswered fields take researched defaults and are recorded in the assumption ledger (auditable, reversible).",
    {
      prompt: z.string().describe("Same prompt passed to brief_start"),
      answers: z
        .record(z.unknown())
        .describe("Question id → answer. Omit what you could not answer."),
    },
    async ({ prompt, answers }) => {
      const brief = compileBrief(prompt, answers);
      return json({
        ok: true,
        brief,
        next: "Define journeys with journey_define, register screens with screen_register, then run project_validate.",
      });
    },
  );

  server.tool(
    "journey_define",
    "Add or replace a journey (a state machine: states reference screens, events move between states). Screens referenced here must be registered via screen_register before project_validate passes.",
    { journey: JourneySchema.describe("The journey definition") },
    async ({ journey }) => {
      const project = store.load();
      const idx = project.journeys.findIndex((j) => j.id === journey.id);
      if (idx >= 0) project.journeys[idx] = journey as Journey;
      else project.journeys.push(journey as Journey);
      store.save(project);
      return json({ ok: true, journeys: project.journeys.map((j) => j.id) });
    },
  );

  server.tool(
    "screen_register",
    "Add or replace a screen: its intent, requiredStates (the contract), designedStates (progress), and components with colors/labels/target sizes for the critics.",
    { screen: ScreenSchema.describe("The screen definition") },
    async ({ screen }) => {
      const project = store.load();
      const idx = project.screens.findIndex((s) => s.id === screen.id);
      if (idx >= 0) project.screens[idx] = screen as Screen;
      else project.screens.push(screen as Screen);
      store.save(project);
      return json({ ok: true, screens: project.screens.map((s) => s.id) });
    },
  );

  server.tool(
    "project_import",
    "Replace the whole project in one call: journeys and screens together. Prefer this over many journey_define/screen_register calls when registering a complete or large design. Validates the full document; unknown fields are rejected.",
    { project: ProjectSchema.describe("The complete JourneyGraph project document") },
    async ({ project }) => {
      store.save(project as Project);
      const report = critique(project as Project);
      return json({
        ok: true,
        path: store.path,
        journeys: (project as Project).journeys.map((j) => j.id),
        screens: (project as Project).screens.map((s) => s.id),
        validation: report.summary,
      });
    },
  );

  server.tool(
    "project_export",
    "Return the complete current project document (for inspection, backup, or transformation before a project_import).",
    {},
    async () => {
      return json(store.load());
    },
  );

  server.tool(
    "palette_check",
    "Check a design system's color pairs against WCAG 2.2 AA (4.5:1) before any screens exist. Reports each pair's exact ratio, pass/fail, and thin-margin passes (under 5.0:1) that one shade lighter would break.",
    {
      pairs: z
        .array(
          z.object({
            name: z.string().describe("Human name, e.g. 'secondary text on paper'"),
            fg: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
            bg: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
          }),
        )
        .min(1),
    },
    async ({ pairs }) => {
      const results = pairs.map(({ name, fg, bg }) => {
        const ratio = contrastRatio(fg, bg);
        return {
          name,
          fg,
          bg,
          ratio: Math.round(ratio * 100) / 100,
          passesAA: ratio >= 4.5,
          thinMargin: ratio >= 4.5 && ratio < 5.0,
        };
      });
      return json({
        results,
        failures: results.filter((r) => !r.passesAA).length,
        thinMargins: results.filter((r) => r.thinMargin).length,
        note: "Thin-margin pairs pass today but fail with minor tint/shade drift — pin them in your token system.",
      });
    },
  );

  server.tool(
    "project_audit",
    "Audit the implementation against the design contract (drift detection). Static tiers: the uxloom.map.json screen registry and data-ux-screen/data-ux-state markers in source. Returns per-state verdicts (implemented with file:line evidence / unimplemented / unproven) and findings with fixes. When implementing screens from the contract, emit data-ux-state markers so the code stays self-auditing.",
    {
      root: z
        .string()
        .optional()
        .describe("Implementation root directory to scan (default: the project file's directory)"),
    },
    async ({ root }) => {
      const project = store.load();
      const auditRoot = root ?? dirname(store.path);
      const map = loadMap(resolve(auditRoot, "uxloom.map.json"));
      return json(runAudit(project, auditRoot, map));
    },
  );

  server.tool(
    "project_validate",
    "Run every critic: journey completeness (unreachable states, dead ends, broken transitions), state coverage, WCAG contrast, touch targets, text expansion. Returns all findings with fixes. Iterate until errors = 0.",
    {},
    async () => {
      const project = store.load();
      return json(critique(project));
    },
  );

  server.tool(
    "screen_critique",
    "Findings scoped to a single screen. Use during iteration on one screen.",
    { screenId: z.string() },
    async ({ screenId }) => {
      const project = store.load();
      return json({ screenId, findings: critiqueScreen(project, screenId) });
    },
  );

  server.tool(
    "coverage_report",
    "The demo number: screens delivered vs. states the journeys actually need. Returns per-screen coverage and the missing-state list.",
    {},
    async () => {
      const project = store.load();
      const report = critique(project);
      const perScreen = project.screens.map((s) => ({
        screen: s.id,
        required: s.requiredStates.length,
        designed: s.requiredStates.filter((st) => s.designedStates.includes(st)).length,
        missing: s.requiredStates.filter((st) => !s.designedStates.includes(st)),
      }));
      const missingTotal = perScreen.reduce((n, s) => n + s.missing.length, 0);
      // A weak contract hides gaps: count screens whose contract itself is
      // happy-path-only, so a rosy "0 missing" can't mislead.
      const happyPathScreens = new Set(
        report.findings
          .filter((f) => f.code === "happy-path-contract")
          .map((f) => f.screen),
      ).size;
      const headline =
        `${project.screens.length} screens registered — ${missingTotal} required states not yet designed` +
        (happyPathScreens > 0
          ? `, and ${happyPathScreens} screen contracts are happy-path-only (their gaps are not even counted yet).`
          : ".");
      return json({
        headline,
        perScreen,
        happyPathScreens,
        errors: report.summary.errors,
        warnings: report.summary.warnings,
      });
    },
  );

  return server;
}
